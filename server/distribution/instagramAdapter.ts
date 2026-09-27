import { spawnSync } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { GRAPH, getConnectedPageWithToken } from "../facebook";
import { resolveTool } from "../postReel";
import { deleteAccount, getAccount, saveAccount } from "./accounts";
import type { MediaFile, PlatformAdapter } from "./types";

/**
 * Instagram via the Instagram API with Facebook Login: the Instagram
 * Professional account linked to the already-connected Facebook Page, driven
 * with that Page's token - no second login. Needs the Meta app's login
 * configuration to include instagram_basic + instagram_content_publish.
 *
 * Reels: resumable upload straight from disk (container with
 * upload_type=resumable -> bytes to rupload.facebook.com -> wait for
 * FINISHED -> media_publish).
 *
 * Images: the API only takes an image_url it can fetch, and this app runs on
 * localhost. So the image is first uploaded to the Facebook Page as an
 * *unpublished* photo (never shown on the Page) and Instagram is handed
 * Facebook's public CDN URL for it. Instagram also only accepts JPEG, so the
 * PNG is converted first.
 */

interface GraphError {
  error?: { message?: string; error_user_msg?: string; error_user_title?: string };
}

function graphError(body: GraphError, fallback: string): Error {
  return new Error(body?.error?.error_user_msg ?? body?.error?.message ?? fallback);
}

async function graphJson<T>(res: Response, fallback: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & GraphError;
  if (!res.ok || body.error) throw graphError(body, `${fallback} (${res.status})`);
  return body;
}

function requirePage() {
  const page = getConnectedPageWithToken();
  if (!page) throw new Error("Instagram publishes through your Facebook Page - connect Facebook in Settings first");
  return page;
}

function requireIgAccount() {
  const acct = getAccount("instagram");
  if (!acct) throw new Error("Instagram isn't connected - connect it in Settings");
  return acct;
}

/**
 * Looks up the Instagram Professional account linked to the connected Page
 * and stores it. Fails with a specific message when there's no linked
 * account (or the app lacks the Instagram permissions, which looks the same
 * from the API's side).
 */
export async function connectInstagram(): Promise<{ id: string; username: string }> {
  const page = requirePage();
  const res = await fetch(
    `${GRAPH}/${page.id}?${new URLSearchParams({ fields: "instagram_business_account{id,username}", access_token: page.access_token })}`,
  );
  const body = await graphJson<{ instagram_business_account?: { id: string; username?: string } }>(res, "Couldn't read the Page's Instagram account");
  const ig = body.instagram_business_account;
  if (!ig) {
    // Facebook hides the linked account when the token lacks Instagram permissions, so the
    // two causes look identical here - ask the token itself which one it is.
    if (!(await pageTokenHasInstagramScope(page.access_token))) {
      throw new Error(
        `Your Facebook login didn't grant Instagram access. A changed Facebook Login configuration only applies to new logins: ` +
          `Disconnect and Connect Facebook again above, and in the Facebook dialog make sure your Instagram account is selected along with "${page.name}".`,
      );
    }
    throw new Error(
      `Instagram permission is granted, but no Instagram account is linked to "${page.name}". Make sure it's a Professional (Business or Creator) account ` +
        "linked to this Page (Meta Business Suite → Settings → Instagram accounts), then Connect again.",
    );
  }
  const username = ig.username ?? ig.id;
  saveAccount({
    platform: "instagram",
    accountId: ig.id,
    accountName: `@${username}`,
    accessToken: null, // uses the Facebook Page token
    refreshToken: null,
    expiresAt: null,
    extra: { pageId: page.id },
  });
  return { id: ig.id, username };
}

/** Whether the Page token carries instagram_basic (via debug_token, using the app's own credentials). Unknown -> true, so the generic message shows. */
async function pageTokenHasInstagramScope(pageToken: string): Promise<boolean> {
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !secret) return true;
  try {
    const res = await fetch(`${GRAPH}/debug_token?${new URLSearchParams({ input_token: pageToken, access_token: `${appId}|${secret}` })}`);
    const body = (await res.json()) as { data?: { scopes?: string[] } };
    return body.data?.scopes ? body.data.scopes.includes("instagram_basic") : true;
  } catch {
    return true;
  }
}

export function disconnectInstagram(): void {
  deleteAccount("instagram");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Containers process asynchronously - poll until FINISHED (or fail on ERROR/EXPIRED). */
async function waitForContainer(containerId: string, token: string, onStage: (s: string) => void): Promise<void> {
  const deadline = Date.now() + 10 * 60 * 1000;
  let polls = 0;
  while (Date.now() < deadline) {
    const res = await fetch(`${GRAPH}/${containerId}?${new URLSearchParams({ fields: "status_code,status", access_token: token })}`);
    const body = await graphJson<{ status_code?: string; status?: string }>(res, "Couldn't check Instagram processing status");
    if (body.status_code === "FINISHED") return;
    if (body.status_code === "ERROR" || body.status_code === "EXPIRED") {
      throw new Error(`Instagram couldn't process the media: ${body.status ?? body.status_code}`);
    }
    onStage(`Processing on Instagram${polls > 0 ? ` (${polls * 5}s)` : ""}`);
    polls++;
    await sleep(5000);
  }
  throw new Error("Instagram took more than 10 minutes to process the media - check the account, it may still appear");
}

async function publishContainer(igId: string, containerId: string, token: string): Promise<{ id: string; permalink: string | null }> {
  const res = await fetch(`${GRAPH}/${igId}/media_publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const { id } = await graphJson<{ id: string }>(res, "Instagram publish failed");
  const linkRes = await fetch(`${GRAPH}/${id}?${new URLSearchParams({ fields: "permalink", access_token: token })}`);
  const link = (await linkRes.json().catch(() => ({}))) as { permalink?: string };
  return { id, permalink: link.permalink ?? null };
}

async function publishReel(media: MediaFile, caption: string, onStage: (s: string) => void, dryRun = false) {
  const page = requirePage();
  const ig = requireIgAccount();
  const token = page.access_token;

  onStage("Starting Instagram upload");
  const createRes = await fetch(`${GRAPH}/${ig.accountId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ media_type: "REELS", upload_type: "resumable", caption, share_to_feed: true, access_token: token }),
  });
  const container = await graphJson<{ id: string; uri?: string }>(createRes, "Couldn't create the Instagram Reel");

  onStage("Uploading to Instagram");
  const bytes = await readFile(media.absPath);
  const uploadRes = await fetch(container.uri ?? `https://rupload.facebook.com/ig-api-upload/v21.0/${container.id}`, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, offset: "0", file_size: String(bytes.length) },
    body: bytes,
  });
  const upload = (await uploadRes.json().catch(() => ({}))) as { success?: boolean; debug_info?: { message?: string } } & GraphError;
  if (!uploadRes.ok || upload.success === false) throw graphError(upload, upload.debug_info?.message ?? `Instagram upload failed (${uploadRes.status})`);

  await waitForContainer(container.id, token, onStage);
  if (dryRun) return { remoteId: container.id, permalink: null };
  onStage("Publishing on Instagram");
  const r = await publishContainer(ig.accountId, container.id, token);
  return { remoteId: r.id, permalink: r.permalink };
}

/** PNG -> JPEG (Instagram's only accepted image format), in the OS temp dir. */
function toJpeg(absPath: string): string {
  const out = join(tmpdir(), `studypal-ig-${randomUUID()}.jpg`);
  const r = spawnSync(resolveTool("ffmpeg"), ["-v", "error", "-y", "-i", absPath, "-q:v", "2", out]);
  if (r.status !== 0) throw new Error(`Couldn't convert the image to JPEG: ${r.stderr?.toString() ?? ""}`);
  return out;
}

async function publishImage(media: MediaFile, caption: string, onStage: (s: string) => void, dryRun = false) {
  const page = requirePage();
  const ig = requireIgAccount();
  const token = page.access_token;

  onStage("Preparing image");
  const jpeg = toJpeg(media.absPath);
  let stagedPhotoId: string | null = null;
  try {
    // Host the image on Facebook's CDN via an unpublished Page photo.
    onStage("Hosting image for Instagram");
    const form = new FormData();
    form.set("access_token", token);
    form.set("published", "false");
    form.set("source", new Blob([await readFile(jpeg)], { type: "image/jpeg" }), "post.jpg");
    const photoRes = await fetch(`${GRAPH}/${page.id}/photos`, { method: "POST", body: form });
    const photo = await graphJson<{ id: string }>(photoRes, "Couldn't stage the image on Facebook");
    stagedPhotoId = photo.id;
    const imgRes = await fetch(`${GRAPH}/${photo.id}?${new URLSearchParams({ fields: "images", access_token: token })}`);
    const { images } = await graphJson<{ images?: { source: string; width: number }[] }>(imgRes, "Couldn't read the staged image");
    const imageUrl = images?.sort((a, b) => b.width - a.width)[0]?.source;
    if (!imageUrl) throw new Error("Facebook didn't return a URL for the staged image");

    onStage("Creating Instagram post");
    const createRes = await fetch(`${GRAPH}/${ig.accountId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, caption, access_token: token }),
    });
    const container = await graphJson<{ id: string }>(createRes, "Couldn't create the Instagram post");
    await waitForContainer(container.id, token, onStage);
    if (dryRun) return { remoteId: container.id, permalink: null };
    onStage("Publishing on Instagram");
    const r = await publishContainer(ig.accountId, container.id, token);
    return { remoteId: r.id, permalink: r.permalink };
  } finally {
    await unlink(jpeg).catch(() => {});
    // Instagram copies the image while processing the container, so the hidden
    // staging photo on the Page isn't needed afterwards - remove it (best effort).
    if (stagedPhotoId) {
      await fetch(`${GRAPH}/${stagedPhotoId}?${new URLSearchParams({ access_token: token })}`, { method: "DELETE" }).catch(() => {});
    }
  }
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",
  label: "Instagram",

  status() {
    const page = getConnectedPageWithToken();
    const acct = getAccount("instagram");
    const connected = page != null && acct != null;
    return {
      platform: "instagram",
      label: "Instagram",
      connected,
      accountName: connected ? acct!.accountName : null,
      setupHint: page
        ? "Link an Instagram Professional account to your Facebook Page, then connect."
        : "Connect Facebook first - Instagram publishes through your Facebook Page.",
      available: true,
    };
  },

  unsupportedReason(media) {
    if (media.kind === "image") {
      // Instagram feed images must be between 4:5 (portrait) and 1.91:1 (landscape).
      const ratio = media.width / media.height;
      if (ratio < 0.8 - 0.01) return "Instagram feed images must be between 4:5 and 1.91:1 - export this one as a reel instead";
      if (ratio > 1.91 + 0.01) return "Instagram feed images must be between 4:5 and 1.91:1";
      return null;
    }
    const d = media.durationSeconds ?? 0;
    if (d < 3) return "Instagram Reels must be at least 3 seconds";
    if (d > 15 * 60) return "Instagram Reels can be at most 15 minutes";
    return null;
  },

  async publish(media, { caption }, onStage) {
    return media.kind === "image" ? publishImage(media, caption, onStage) : publishReel(media, caption, onStage);
  },
};

/**
 * Runs the full Instagram upload + processing for `media` but stops before
 * media_publish, so nothing is posted - used to verify the connection and the
 * upload path against a live account. The unpublished container expires on
 * Instagram's side after 24h.
 */
export async function instagramDryRun(media: MediaFile, onStage: (s: string) => void = () => {}): Promise<{ containerId: string }> {
  const reason = instagramAdapter.unsupportedReason(media);
  if (reason) throw new Error(reason);
  const r = media.kind === "image" ? await publishImage(media, "", onStage, true) : await publishReel(media, "", onStage, true);
  return { containerId: r.remoteId };
}
