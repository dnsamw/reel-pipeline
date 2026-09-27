import { createHash, randomBytes } from "node:crypto";
import { open } from "node:fs/promises";
import { deleteAccount, getAccount, saveAccount } from "./accounts";
import type { PlatformAdapter } from "./types";

/**
 * TikTok via the Content Posting API's *Upload* flow (scope video.upload):
 * the video lands in the creator's TikTok inbox as a draft, and they finish
 * and post it in the TikTok app. Chosen over Direct Post because it works
 * without TikTok's app audit (unaudited Direct Post is forced private-only).
 * The API doesn't take a caption for inbox uploads - it's written in the app.
 *
 * Login: Login Kit for *Desktop*, which (unlike the web kit) accepts a
 * localhost/127.0.0.1 redirect, with PKCE. TikTok's desktop PKCE uses the
 * HEX SHA-256 of the verifier as code_challenge - not base64url like Google.
 * Register http://127.0.0.1:*\/api/tiktok/callback/ (wildcard port) in the app.
 *
 * Limits: 5 pending inbox shares per 24h, 6 requests/min per token; access
 * tokens last 24h, refresh tokens 365 days. Videos only - photos require
 * PULL_FROM_URL from a verified domain, which a local app doesn't have.
 */

const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com/v2";
const SCOPES = ["user.info.basic", "video.upload"];
/**
 * Only requested when connecting "with stats" (Insights page): TikTok rejects the whole login if the app
 * hasn't been granted a scope, and video.list needs the Display API added to the app - so it's opt-in.
 */
export const TIKTOK_STATS_SCOPE = "video.list";

// TikTok's FILE_UPLOAD chunk rules: 5-64MB per chunk (the last may be up to 128MB); under 5MB = one chunk.
const MAX_SINGLE_CHUNK = 64 * 1024 * 1024;
const CHUNK = 10 * 1024 * 1024;

function clientCreds(): { key: string; secret: string } | null {
  const key = process.env.TIKTOK_CLIENT_KEY;
  const secret = process.env.TIKTOK_CLIENT_SECRET;
  return key && secret ? { key, secret } : null;
}

/** Trailing slash on purpose - TikTok matches the registered URI exactly and its examples all end in "/". */
function redirectUri(port: number): string {
  return `http://127.0.0.1:${port}/api/tiktok/callback/`;
}

const pending = new Map<string, { verifier: string; port: number; expires: number }>();

export function buildTikTokAuthUrl(port: number, withStats = false): string {
  const creds = clientCreds();
  if (!creds) throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET aren't set - add them to .env (see Settings → TikTok setup steps) and restart the server");
  const state = randomBytes(16).toString("hex");
  // Unreserved characters only, 43-128 long.
  const verifier = randomBytes(48).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, 64);
  pending.set(state, { verifier, port, expires: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_key: creds.key,
    response_type: "code",
    scope: (withStats ? [...SCOPES, TIKTOK_STATS_SCOPE] : SCOPES).join(","),
    redirect_uri: redirectUri(port),
    state,
    code_challenge: createHash("sha256").update(verifier).digest("hex"),
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

interface TikTokToken {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<Required<Pick<TikTokToken, "access_token" | "refresh_token" | "expires_in">> & TikTokToken> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TikTokToken;
  if (!res.ok || json.error || !json.access_token || !json.refresh_token) {
    if (json.error === "invalid_grant") throw new Error("TikTok login has expired or was revoked - reconnect TikTok in Settings");
    throw new Error(`TikTok sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json as Required<Pick<TikTokToken, "access_token" | "refresh_token" | "expires_in">> & TikTokToken;
}

/** TikTok's API envelope: { data, error: { code: "ok" | ..., message, log_id } }. */
async function apiJson<T>(res: Response, what: string): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: { code?: string; message?: string } };
  const code = body.error?.code;
  if (!res.ok || (code && code !== "ok")) {
    const friendly: Record<string, string> = {
      spam_risk_too_many_pending_share: "TikTok allows at most 5 pending drafts per 24 hours - finish or delete some in the TikTok app first",
      scope_not_authorized: "TikTok didn't grant video.upload - check the app has the Content Posting API (Upload) and reconnect TikTok",
      access_token_invalid: "TikTok login has expired - reconnect TikTok in Settings",
      rate_limit_exceeded: "TikTok rate limit hit (6 requests a minute) - wait a minute and try again",
    };
    throw new Error((code && friendly[code]) ?? `${what}: ${body.error?.message ?? code ?? res.status}`);
  }
  return body.data as T;
}

/** Callback half of the login: exchange the code (with the PKCE verifier), read the profile, store the account. */
export async function completeTikTokLogin(code: string, state: string): Promise<{ name: string }> {
  const creds = clientCreds();
  const p = pending.get(state);
  pending.delete(state);
  if (!creds || !p || p.expires < Date.now()) throw new Error("Invalid or expired TikTok login attempt - try connecting again");

  const t = await tokenRequest({
    client_key: creds.key,
    client_secret: creds.secret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(p.port),
    code_verifier: p.verifier,
  });
  if (t.scope && !t.scope.split(",").includes("video.upload")) {
    throw new Error("TikTok login didn't include video.upload - enable the Content Posting API (Upload) for the app, then connect again");
  }

  const userRes = await fetch(`${API}/user/info/?fields=open_id,display_name`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const user = await apiJson<{ user?: { open_id?: string; display_name?: string } }>(userRes, "Couldn't read the TikTok profile");
  const name = user.user?.display_name ?? "TikTok account";

  saveAccount({
    platform: "tiktok",
    accountId: user.user?.open_id ?? t.open_id ?? "tiktok",
    accountName: name,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    extra: { scopes: t.scope?.split(",") ?? [] },
  });
  return { name };
}

export async function disconnectTikTok(): Promise<void> {
  const acct = getAccount("tiktok");
  const creds = clientCreds();
  // Best effort: also revoke on TikTok's side so the app loses access, not just this machine.
  if (acct?.accessToken && creds) {
    await fetch(`${API}/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: creds.key, client_secret: creds.secret, token: acct.accessToken }),
    }).catch(() => {});
  }
  deleteAccount("tiktok");
}

/** Also used by server/analytics/ (video.list). */
export async function tiktokAccessToken(): Promise<string> {
  return accessToken();
}

async function accessToken(): Promise<string> {
  const acct = getAccount("tiktok");
  if (!acct?.refreshToken) throw new Error("TikTok isn't connected - connect it in Settings");
  if (acct.accessToken && acct.expiresAt && Date.parse(acct.expiresAt) - Date.now() > 60_000) return acct.accessToken;
  const creds = clientCreds();
  if (!creds) throw new Error("TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET aren't set in .env");
  const t = await tokenRequest({ client_key: creds.key, client_secret: creds.secret, grant_type: "refresh_token", refresh_token: acct.refreshToken });
  // TikTok may rotate the refresh token - always store the returned one.
  saveAccount({ ...acct, accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString() });
  return t.access_token;
}

/** chunk_size / total_chunk_count per TikTok's rules: the remainder rides on the last chunk. */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  // One exact-size chunk whenever the rules allow it: always under 5MB (required), and up to 64MB (the max chunk).
  if (size <= MAX_SINGLE_CHUNK) return { chunkSize: size, count: 1 };
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",
  label: "TikTok",

  status() {
    const configured = clientCreds() != null;
    const acct = getAccount("tiktok");
    return {
      platform: "tiktok",
      label: "TikTok",
      connected: configured && acct != null,
      accountName: acct?.accountName ?? null,
      setupHint: configured
        ? "Reels go to your TikTok drafts - finish and post them in the TikTok app."
        : "Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to .env (see setup steps), then restart the server.",
      available: true,
      configured,
    };
  },

  unsupportedReason(media) {
    if (media.kind === "image") return "TikTok photo posts need a verified website domain - export this one as a reel";
    const d = media.durationSeconds ?? 0;
    if (d < 3) return "TikTok videos must be at least 3 seconds";
    if (d > 10 * 60) return "TikTok uploads can be at most 10 minutes";
    return null;
  },

  async publish(media, _options, onStage) {
    const token = await accessToken();
    const { chunkSize, count } = chunkPlan(media.sizeBytes);

    onStage("Starting TikTok upload");
    const initRes = await fetch(`${API}/post/publish/inbox/video/init/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ source_info: { source: "FILE_UPLOAD", video_size: media.sizeBytes, chunk_size: chunkSize, total_chunk_count: count } }),
    });
    const init = await apiJson<{ publish_id: string; upload_url: string }>(initRes, "TikTok upload couldn't start");

    const file = await open(media.absPath, "r");
    try {
      for (let i = 0; i < count; i++) {
        const start = i * chunkSize;
        const end = i === count - 1 ? media.sizeBytes - 1 : start + chunkSize - 1;
        const buf = Buffer.alloc(end - start + 1);
        await file.read(buf, 0, buf.length, start);
        onStage(count > 1 ? `Uploading to TikTok (${i + 1}/${count})` : "Uploading to TikTok");
        const put = await fetch(init.upload_url, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4", "Content-Length": String(buf.length), "Content-Range": `bytes ${start}-${end}/${media.sizeBytes}` },
          body: buf,
        });
        if (put.status !== 201 && put.status !== 206 && !put.ok) throw new Error(`TikTok upload failed on part ${i + 1} (${put.status})`);
      }
    } finally {
      await file.close();
    }

    // Poll until it lands in the inbox. 10s apart keeps well under 6 requests/minute.
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      await sleep(10_000);
      const res = await fetch(`${API}/post/publish/status/fetch/`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify({ publish_id: init.publish_id }),
      });
      const st = await apiJson<{ status: string; fail_reason?: string }>(res, "Couldn't check the TikTok upload");
      if (st.status === "SEND_TO_USER_INBOX") return { remoteId: init.publish_id, permalink: null, outcome: "draft" };
      if (st.status === "PUBLISH_COMPLETE") return { remoteId: init.publish_id, permalink: null, outcome: "live" };
      if (st.status === "FAILED") throw new Error(`TikTok couldn't process the video: ${st.fail_reason ?? "unknown reason"}`);
      onStage("Processing on TikTok");
    }
    throw new Error("TikTok took more than 10 minutes to process the upload - check your TikTok inbox, it may still arrive");
  },
};
