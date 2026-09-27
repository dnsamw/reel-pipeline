import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { deleteAccount, getAccount, saveAccount } from "./accounts";
import { isVertical916 } from "./media";
import type { MediaFile, PlatformAdapter } from "./types";

/**
 * YouTube via the Data API v3 (videos.insert, resumable upload).
 *
 * Login is Google's OAuth for installed/desktop apps: the redirect is a
 * loopback URL on this machine (http://127.0.0.1:<port>/api/youtube/callback),
 * which Google allows for "Desktop app" OAuth clients without registering it,
 * with PKCE. access_type=offline + prompt=consent gets a refresh token.
 *
 * Two platform rules worth knowing (see docs/ARCHITECTURE.md):
 * - Until the Google Cloud project passes YouTube's API audit, every upload is
 *   forced to Private whatever privacyStatus is requested.
 * - While the OAuth consent screen is in "Testing", Google expires the refresh
 *   token after 7 days - the next publish then asks to reconnect.
 *
 * Vertical videos of up to 3 minutes are classified as Shorts by YouTube
 * itself; there's no separate Shorts endpoint.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
// yt-analytics.readonly = watch time / % watched for the Insights page (server/analytics/). Connections made
// before it was added lack it until reconnected - the Insights page says so.
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];
export const YT_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/yt-analytics.readonly";

export type YouTubePrivacy = "private" | "unlisted" | "public";

function clientCreds(): { id: string; secret: string } | null {
  const id = process.env.YOUTUBE_CLIENT_ID;
  const secret = process.env.YOUTUBE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

function redirectUri(port: number): string {
  return `http://127.0.0.1:${port}/api/youtube/callback`;
}

// OAuth state -> PKCE verifier, short-lived and in memory (same reasoning as facebook.ts's pendingStates).
const pending = new Map<string, { verifier: string; port: number; expires: number }>();

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function buildYouTubeAuthUrl(port: number): string {
  const creds = clientCreds();
  if (!creds) throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET aren't set - add them to .env (see Settings → YouTube setup steps) and restart the server");
  const state = b64url(randomBytes(16));
  const verifier = b64url(randomBytes(32));
  pending.set(state, { verifier, port, expires: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: creds.id,
    redirect_uri: redirectUri(port),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: b64url(createHash("sha256").update(verifier).digest()),
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  /** Space-separated scopes actually granted. */
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error) {
    if (json.error === "invalid_grant") {
      throw new Error(
        "YouTube login has expired or was revoked. While your Google OAuth consent screen is in \"Testing\", Google expires it after 7 days - reconnect YouTube in Settings.",
      );
    }
    throw new Error(`Google sign-in failed: ${json.error_description ?? json.error ?? res.status}`);
  }
  return json;
}

/** Callback half of the login: exchanges the code, reads the channel, stores the account. */
export async function completeYouTubeLogin(code: string, state: string): Promise<{ channel: string }> {
  const creds = clientCreds();
  const p = pending.get(state);
  pending.delete(state);
  if (!creds || !p || p.expires < Date.now()) throw new Error("Invalid or expired YouTube login attempt - try connecting again");

  const tokens = await tokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: creds.id,
    client_secret: creds.secret,
    redirect_uri: redirectUri(p.port),
    code_verifier: p.verifier,
  });
  if (!tokens.refresh_token) throw new Error("Google didn't return a refresh token - disconnect the app under myaccount.google.com → Security → Third-party access, then connect again");

  const chRes = await fetch(`${API}/channels?part=snippet&mine=true`, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const ch = (await chRes.json().catch(() => ({}))) as { items?: { id: string; snippet?: { title?: string; customUrl?: string } }[]; error?: { message?: string } };
  const channel = ch.items?.[0];
  if (!channel) throw new Error(ch.error?.message ?? "That Google account has no YouTube channel - create one on youtube.com first");

  saveAccount({
    platform: "youtube",
    accountId: channel.id,
    accountName: channel.snippet?.title ?? channel.snippet?.customUrl ?? channel.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    extra: { customUrl: channel.snippet?.customUrl ?? null, scopes: tokens.scope?.split(" ") ?? [] },
  });
  return { channel: channel.snippet?.title ?? channel.id };
}

export function disconnectYouTube(): void {
  deleteAccount("youtube");
}

/** A valid access token, refreshed when it's within a minute of expiring. Also used by server/analytics/. */
export async function youtubeAccessToken(): Promise<string> {
  return accessToken();
}

async function accessToken(): Promise<string> {
  const acct = getAccount("youtube");
  if (!acct?.refreshToken) throw new Error("YouTube isn't connected - connect it in Settings");
  if (acct.accessToken && acct.expiresAt && Date.parse(acct.expiresAt) - Date.now() > 60_000) return acct.accessToken;
  const creds = clientCreds();
  if (!creds) throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET aren't set in .env");
  const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: acct.refreshToken, client_id: creds.id, client_secret: creds.secret });
  saveAccount({ ...acct, accessToken: t.access_token, expiresAt: new Date(Date.now() + t.expires_in * 1000).toISOString(), connectedAt: acct.connectedAt });
  return t.access_token;
}

/** YouTube's error envelope -> a message that says what to do. */
function youtubeError(body: { error?: { message?: string; errors?: { reason?: string }[] } }, status: number): Error {
  const reason = body.error?.errors?.[0]?.reason;
  if (reason === "quotaExceeded") return new Error("YouTube API quota for today is used up (it resets at midnight Pacific time)");
  if (reason === "uploadLimitExceeded") return new Error("This channel has hit YouTube's daily upload limit - try again tomorrow");
  if (reason === "youtubeSignupRequired") return new Error("That Google account has no YouTube channel - create one on youtube.com first");
  return new Error(body.error?.message ?? `YouTube upload failed (${status})`);
}

/** YouTube titles: required, max 100 chars, no angle brackets. Falls back to the caption's first line. */
function titleFor(title: string | undefined, caption: string): string {
  const firstLine = caption.split("\n").map((l) => l.replace(/#\S+/g, "").trim()).find(Boolean);
  return ((title?.trim() || firstLine || "StudyPal").replace(/[<>]/g, "")).slice(0, 100);
}

export const youtubeAdapter: PlatformAdapter = {
  platform: "youtube",
  label: "YouTube",

  status() {
    const configured = clientCreds() != null;
    const acct = getAccount("youtube");
    return {
      platform: "youtube",
      label: "YouTube",
      connected: configured && acct != null,
      accountName: acct?.accountName ?? null,
      setupHint: configured
        ? "Shorts from your reels. Uploads are Private by default."
        : "Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env (see setup steps), then restart the server.",
      available: true,
      configured,
    };
  },

  unsupportedReason(media) {
    if (media.kind === "image") return "YouTube doesn't take image posts - export this one as a reel";
    if ((media.durationSeconds ?? 0) > 15 * 60) return "Longer than 15 minutes - needs a verified YouTube account";
    return null;
  },

  async publish(media, { caption, title, privacy }, onStage) {
    const token = await accessToken();
    const privacyStatus: YouTubePrivacy = privacy ?? "private";

    onStage("Starting YouTube upload");
    const bytes = await readFile(media.absPath);
    const init = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(bytes.length),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: { title: titleFor(title, caption), description: caption.slice(0, 5000), categoryId: "27" /* Education */ },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
    });
    const location = init.headers.get("location");
    if (!init.ok || !location) throw youtubeError(await init.json().catch(() => ({})), init.status);

    onStage("Uploading to YouTube");
    const put = await fetch(location, { method: "PUT", headers: { "Content-Type": "video/mp4" }, body: bytes });
    const video = (await put.json().catch(() => ({}))) as { id?: string; status?: { privacyStatus?: string } } & Parameters<typeof youtubeError>[0];
    if (!put.ok || !video.id) throw youtubeError(video, put.status);

    // Unaudited projects get forced to private whatever was asked - report what YouTube actually did.
    const actual = video.status?.privacyStatus ?? privacyStatus;
    const outcome = actual === "private" ? "private" : actual === "unlisted" ? "unlisted" : "live";
    return { outcome, remoteId: video.id, permalink: isYouTubeShort(media) ? `https://www.youtube.com/shorts/${video.id}` : `https://www.youtube.com/watch?v=${video.id}` };
  },
};

/** YouTube files vertical videos of up to 3 minutes as Shorts. */
export function isYouTubeShort(media: MediaFile): boolean {
  return isVertical916(media) && (media.durationSeconds ?? 0) <= 180;
}
