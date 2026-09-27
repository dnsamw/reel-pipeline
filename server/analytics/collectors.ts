import { GRAPH, getConnectedPageWithToken } from "../facebook";
import { getAccount } from "../distribution/accounts";
import { youtubeAccessToken } from "../distribution/youtubeAdapter";
import { tiktokAccessToken } from "../distribution/tiktokAdapter";
import type { AccountPost, PostKind, PostMetrics, StatsAccess, StatsPlatform } from "../../src/analytics/types";

/**
 * Lists every post on each connected account - not just the ones this app
 * published - with whatever stats the account's permissions allow. A missing
 * permission lowers the platform's access level and adds a fix note instead
 * of failing the refresh.
 */

export const EMPTY_METRICS: PostMetrics = {
  views: null,
  reach: null,
  likes: null,
  comments: null,
  shares: null,
  saves: null,
  avgWatchSeconds: null,
  avgWatchPct: null,
  followsGained: null,
};

/** Per-post detail calls (insights) are made for at most this many of the newest posts per refresh. */
const MAX_DETAIL_CALLS = 120;
/** Pages of listings followed per platform - generous; a page is 50-100 posts. */
const MAX_PAGES = 20;

export interface CollectResult {
  access: StatsAccess;
  /** Every post found on the account. `complete` = the listing succeeded, so posts missing from it were deleted. */
  posts: AccountPost[];
  complete: boolean;
}

function result(platform: StatsPlatform, connected: boolean): CollectResult {
  return {
    access: { platform, connected, level: connected ? "full" : "none", fix: connected ? null : "Not connected - connect it in Settings." },
    posts: [],
    complete: false,
  };
}

function downgrade(r: CollectResult, level: "partial" | "none", fix: string): void {
  const rank = { full: 2, partial: 1, none: 0 };
  if (rank[level] < rank[r.access.level]) r.access.level = level;
  if (!r.access.fix) r.access.fix = fix;
}

const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;

interface GraphErr {
  error?: { message?: string; code?: number };
}

type GraphResult<T> = { ok: true; body: T } | { ok: false; code: number | null; message: string };

async function graph<T>(url: string): Promise<GraphResult<T>> {
  try {
    const res = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as T & GraphErr;
    if (!res.ok || body.error) return { ok: false, code: body.error?.code ?? res.status, message: body.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, body };
  } catch (err) {
    return { ok: false, code: null, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Follows Graph API `paging.next` links. */
async function graphAll<T>(firstUrl: string): Promise<GraphResult<T[]>> {
  const out: T[] = [];
  let url: string | undefined = firstUrl;
  for (let i = 0; url && i < MAX_PAGES; i++) {
    const r: GraphResult<{ data?: T[]; paging?: { next?: string } }> = await graph(url);
    if (!r.ok) return r;
    out.push(...(r.body.data ?? []));
    url = r.body.paging?.next;
  }
  return { ok: true, body: out };
}

/** Meta permission errors: #10 (no permission), #200 (permission missing/insufficient). */
const isPermission = (code: number | null, message: string) => code === 10 || code === 200 || /permission/i.test(message);

const fullLink = (link: string | null | undefined) => (!link ? null : link.startsWith("http") ? link : `https://www.facebook.com${link}`);

// --- Facebook ---

/**
 * The permissions the connected Page token actually carries (debug_token with the app's own token).
 * Asked once per token so the access level is known without probing. null = couldn't check.
 */
let scopeCache: { token: string; scopes: string[] | null } | null = null;
async function pageTokenScopes(pageToken: string): Promise<string[] | null> {
  if (scopeCache?.token === pageToken) return scopeCache.scopes;
  const appId = process.env.FACEBOOK_APP_ID;
  const secret = process.env.FACEBOOK_APP_SECRET;
  let scopes: string[] | null = null;
  if (appId && secret) {
    const r = await graph<{ data?: { scopes?: string[] } }>(
      `${GRAPH}/debug_token?input_token=${encodeURIComponent(pageToken)}&access_token=${encodeURIComponent(`${appId}|${secret}`)}`,
    );
    if (r.ok) scopes = r.body.data?.scopes ?? null;
  }
  scopeCache = { token: pageToken, scopes };
  return scopes;
}

const FB_INSIGHTS_FIX =
  "Views are read, but watch time needs the read_insights permission: add it to your Facebook Login for Business configuration (Meta app dashboard), then Disconnect and Connect Facebook in Settings.";
const IG_INSIGHTS_FIX =
  "Views, reach, saves and watch time need instagram_manage_insights: add it to your Facebook Login for Business configuration, then Disconnect and Connect Facebook (and Instagram) in Settings.";

// video_insights metric names vary by video type (Reel vs Page video) and API version - map the ones we know.
const FB_VIDEO_METRICS: Record<string, keyof PostMetrics> = {
  post_impressions_unique: "reach",
  total_video_impressions_unique: "reach",
  post_video_followers: "followsGained",
};

interface FbVideo {
  id: string;
  description?: string;
  created_time: string;
  length?: number;
  permalink_url?: string;
  views?: number;
  likes?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
}

interface FbPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
  attachments?: { data?: { type?: string }[] };
}

/** Feed items that aren't posts worth measuring, or that are counted through the video listings instead. */
const FB_SKIP_TYPES = new Set(["video_inline", "video_autoplay", "video", "animated_image_video", "cover_photo", "profile_media"]);

export async function collectFacebook(): Promise<CollectResult> {
  const page = getConnectedPageWithToken();
  const r = result("facebook", page != null);
  if (!page) return r;
  const tok = `access_token=${encodeURIComponent(page.access_token)}`;
  const scopes = await pageTokenScopes(page.access_token);
  const canInsights = !scopes || scopes.includes("read_insights");
  if (!canInsights) downgrade(r, "partial", FB_INSIGHTS_FIX);

  const videoFields = "id,description,created_time,length,permalink_url,views,likes.summary(true).limit(0),comments.summary(true).limit(0)";
  const [reels, videos, feed] = await Promise.all([
    graphAll<FbVideo>(`${GRAPH}/${page.id}/video_reels?fields=${videoFields}&limit=100&${tok}`),
    graphAll<FbVideo>(`${GRAPH}/${page.id}/videos?fields=${videoFields}&limit=100&${tok}`),
    graphAll<FbPost>(
      `${GRAPH}/${page.id}/posts?fields=id,message,created_time,permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0),attachments{type}&limit=100&${tok}`,
    ),
  ]);
  if (!reels.ok || !videos.ok || !feed.ok) {
    const failed = [reels, videos, feed].find((x) => !x.ok) as { code: number | null; message: string };
    downgrade(r, "none", `Couldn't list the Page's posts: ${failed.message}`);
    return r;
  }

  const reelIds = new Set(reels.body.map((v) => v.id));
  const toPost = (v: FbVideo, kind: PostKind): AccountPost => ({
    platform: "facebook",
    remoteId: v.id,
    createdAt: new Date(v.created_time).toISOString(),
    kind,
    caption: v.description ?? null,
    title: null,
    durationSeconds: num(v.length),
    permalink: fullLink(v.permalink_url),
    metrics: { ...EMPTY_METRICS, views: num(v.views), likes: num(v.likes?.summary?.total_count), comments: num(v.comments?.summary?.total_count) },
    note: null,
  });
  const posts: AccountPost[] = [
    ...reels.body.map((v) => toPost(v, "reel")),
    ...videos.body.filter((v) => !reelIds.has(v.id)).map((v) => toPost(v, "video")),
  ];
  for (const p of feed.body) {
    const type = p.attachments?.data?.[0]?.type ?? "text";
    if (FB_SKIP_TYPES.has(type)) continue;
    posts.push({
      platform: "facebook",
      remoteId: p.id,
      createdAt: new Date(p.created_time).toISOString(),
      kind: type === "album" ? "carousel" : type === "photo" ? "photo" : "text",
      caption: p.message ?? null,
      title: null,
      durationSeconds: null,
      permalink: fullLink(p.permalink_url),
      metrics: { ...EMPTY_METRICS, likes: num(p.reactions?.summary?.total_count), comments: num(p.comments?.summary?.total_count), shares: num(p.shares?.count) ?? 0 },
      note: null,
    });
  }

  // Watch time / reach per video - one call each, newest first.
  if (canInsights) {
    const vids = posts.filter((p) => p.kind === "reel" || p.kind === "video").sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_DETAIL_CALLS);
    for (const p of vids) {
      const ins = await graph<{ data?: { name: string; values?: { value?: unknown }[] }[] }>(`${GRAPH}/${p.remoteId}/video_insights?${tok}`);
      if (!ins.ok) {
        if (isPermission(ins.code, ins.message)) {
          downgrade(r, "partial", FB_INSIGHTS_FIX);
          break;
        }
        continue;
      }
      for (const d of ins.body.data ?? []) {
        const v = d.values?.[0]?.value;
        const key = FB_VIDEO_METRICS[d.name];
        if (key && p.metrics[key] == null) p.metrics[key] = num(v);
        if (d.name === "post_video_avg_time_watched" && num(v) != null) p.metrics.avgWatchSeconds = num(v)! / 1000;
        if (d.name === "post_video_social_actions" && v && typeof v === "object") p.metrics.shares = num((v as Record<string, unknown>).share);
      }
      if (p.metrics.avgWatchSeconds != null && p.durationSeconds) p.metrics.avgWatchPct = Math.min(100, (p.metrics.avgWatchSeconds / p.durationSeconds) * 100);
    }
  }

  r.posts = posts;
  r.complete = true;
  return r;
}

// --- Instagram ---

interface IgMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
  permalink?: string;
}

export async function collectInstagram(): Promise<CollectResult> {
  const page = getConnectedPageWithToken();
  const ig = getAccount("instagram");
  const r = result("instagram", page != null && ig != null);
  if (!page || !ig) return r;
  const tok = `access_token=${encodeURIComponent(page.access_token)}`;
  const scopes = await pageTokenScopes(page.access_token);
  let canInsights = !scopes || scopes.includes("instagram_manage_insights");
  if (!canInsights) downgrade(r, "partial", IG_INSIGHTS_FIX);

  const media = await graphAll<IgMedia>(
    `${GRAPH}/${ig.accountId}/media?fields=id,caption,media_type,media_product_type,timestamp,like_count,comments_count,permalink&limit=100&${tok}`,
  );
  if (!media.ok) {
    downgrade(r, "none", `Couldn't list the Instagram posts: ${media.message}`);
    return r;
  }

  const posts: AccountPost[] = media.body.map((m) => ({
    platform: "instagram",
    remoteId: m.id,
    createdAt: new Date(m.timestamp).toISOString(),
    kind: m.media_product_type === "REELS" ? "reel" : m.media_type === "CAROUSEL_ALBUM" ? "carousel" : m.media_type === "VIDEO" ? "video" : "photo",
    caption: m.caption ?? null,
    title: null,
    durationSeconds: null,
    permalink: m.permalink ?? null,
    metrics: { ...EMPTY_METRICS, likes: num(m.like_count), comments: num(m.comments_count) },
    note: null,
  }));

  if (canInsights) {
    for (const p of [...posts].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, MAX_DETAIL_CALLS)) {
      // Asking for a metric a media type doesn't support fails the whole call, so each type gets its own list.
      const metricList = p.kind === "reel" ? "views,reach,saved,shares,ig_reels_avg_watch_time" : "views,reach,saved,shares";
      const ins = await graph<{ data?: { name: string; values?: { value?: unknown }[]; total_value?: { value?: unknown } }[] }>(
        `${GRAPH}/${p.remoteId}/insights?metric=${metricList}&${tok}`,
      );
      if (!ins.ok) {
        if (isPermission(ins.code, ins.message)) {
          downgrade(r, "partial", IG_INSIGHTS_FIX);
          canInsights = false;
          break;
        }
        continue;
      }
      for (const d of ins.body.data ?? []) {
        const v = num(d.values?.[0]?.value ?? d.total_value?.value);
        if (d.name === "views") p.metrics.views = v;
        else if (d.name === "reach") p.metrics.reach = v;
        else if (d.name === "saved") p.metrics.saves = v;
        else if (d.name === "shares") p.metrics.shares = v;
        else if (d.name === "ig_reels_avg_watch_time" && v != null) p.metrics.avgWatchSeconds = v / 1000;
      }
    }
  }

  r.posts = posts;
  r.complete = true;
  return r;
}

// --- YouTube ---

/** "PT1M5S" -> 65 */
function isoDuration(d: string | undefined): number | null {
  const m = d?.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  const [, days, h, min, s] = m.map((x) => Number(x ?? 0));
  return days * 86400 + h * 3600 + min * 60 + s;
}

export async function collectYouTube(): Promise<CollectResult> {
  const r = result("youtube", getAccount("youtube") != null);
  if (!r.access.connected) return r;
  let token: string;
  try {
    token = await youtubeAccessToken();
  } catch (err) {
    downgrade(r, "none", err instanceof Error ? err.message : String(err));
    return r;
  }
  const yt = async <T>(url: string): Promise<{ ok: true; body: T } | { ok: false; message: string }> => {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    return res.ok ? { ok: true, body } : { ok: false, message: body.error?.message ?? `HTTP ${res.status}` };
  };

  // Every upload: the channel's "uploads" playlist.
  const ch = await yt<{ items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[] }>(
    "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
  );
  const uploads = ch.ok ? ch.body.items?.[0]?.contentDetails?.relatedPlaylists?.uploads : undefined;
  if (!uploads) {
    downgrade(r, "none", `Couldn't read the channel's uploads${ch.ok ? "" : `: ${ch.message}`}`);
    return r;
  }
  const ids: string[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const res = await yt<{ items?: { contentDetails?: { videoId?: string } }[]; nextPageToken?: string }>(
      `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${pageToken ? `&pageToken=${pageToken}` : ""}`,
    );
    if (!res.ok) {
      downgrade(r, "none", `YouTube: ${res.message}`);
      return r;
    }
    for (const it of res.body.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    pageToken = res.body.nextPageToken;
    if (!pageToken) break;
  }

  const posts: AccountPost[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const res = await yt<{
      items?: {
        id: string;
        snippet?: { title?: string; description?: string; publishedAt?: string };
        statistics?: Record<string, string>;
        contentDetails?: { duration?: string };
        status?: { privacyStatus?: string };
      }[];
    }>(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails,status&id=${ids.slice(i, i + 50).join(",")}`);
    if (!res.ok) {
      downgrade(r, "none", `YouTube: ${res.message}`);
      return r;
    }
    for (const it of res.body.items ?? []) {
      const duration = isoDuration(it.contentDetails?.duration);
      const isPrivate = it.status?.privacyStatus === "private";
      posts.push({
        platform: "youtube",
        remoteId: it.id,
        createdAt: new Date(it.snippet?.publishedAt ?? Date.now()).toISOString(),
        // Vertical videos up to 3 minutes are Shorts; the API doesn't say which, so length is the best guess.
        kind: duration != null && duration <= 180 ? "reel" : "video",
        caption: it.snippet?.description ?? null,
        title: it.snippet?.title ?? null,
        durationSeconds: duration,
        permalink: duration != null && duration <= 180 ? `https://www.youtube.com/shorts/${it.id}` : `https://www.youtube.com/watch?v=${it.id}`,
        metrics: { ...EMPTY_METRICS, views: num(it.statistics?.viewCount), likes: num(it.statistics?.likeCount), comments: num(it.statistics?.commentCount) },
        note: isPrivate ? "Private on YouTube - nobody can see it, so it isn't compared. Make it public in YouTube Studio." : null,
      });
    }
  }

  // Watch time from the Analytics API (needs yt-analytics.readonly, lags ~1-2 days).
  const byId = new Map(posts.map((p) => [p.remoteId, p]));
  for (let i = 0; i < ids.length; i += 200) {
    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: "2020-01-01",
      endDate: new Date().toISOString().slice(0, 10),
      metrics: "views,averageViewDuration,averageViewPercentage,shares,subscribersGained",
      dimensions: "video",
      filters: `video==${ids.slice(i, i + 200).join(",")}`,
    });
    const res = await fetch(`https://youtubeanalytics.googleapis.com/v2/reports?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = (await res.json().catch(() => ({}))) as { rows?: unknown[][]; columnHeaders?: { name: string }[]; error?: { message?: string } };
    if (!res.ok) {
      const msg = body.error?.message ?? String(res.status);
      if (res.status === 403 && /scope|insufficient/i.test(msg)) {
        downgrade(r, "partial", "Watch time needs the YouTube Analytics permission: Disconnect and Connect YouTube in Settings (the app now asks for it).");
      } else if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) {
        downgrade(
          r,
          "partial",
          'Watch time needs the "YouTube Analytics API": enable it in Google Cloud Console (APIs & Services → Library, same project as YOUTUBE_CLIENT_ID), wait a few minutes, then Disconnect and Connect YouTube in Settings.',
        );
      } else {
        downgrade(r, "partial", `YouTube Analytics: ${msg}`);
      }
      break;
    }
    const col = (name: string) => (body.columnHeaders ?? []).findIndex((c) => c.name === name);
    for (const row of body.rows ?? []) {
      const p = byId.get(String(row[col("video")]));
      if (!p) continue;
      p.metrics.avgWatchSeconds = num(row[col("averageViewDuration")]);
      p.metrics.avgWatchPct = num(row[col("averageViewPercentage")]);
      p.metrics.shares = num(row[col("shares")]);
      p.metrics.followsGained = num(row[col("subscribersGained")]);
    }
  }

  r.posts = posts;
  r.complete = true;
  return r;
}

// --- TikTok ---

export interface TikTokVideo {
  id: string;
  createTime: string;
  description: string;
  durationSeconds: number | null;
  shareUrl: string | null;
}

export async function collectTikTok(): Promise<CollectResult> {
  const r = result("tiktok", getAccount("tiktok") != null);
  if (!r.access.connected) return r;
  try {
    const token = await tiktokAccessToken();
    const fields = "id,create_time,title,video_description,duration,view_count,like_count,comment_count,share_count,share_url";
    let cursor: number | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${fields}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(cursor ? { max_count: 20, cursor } : { max_count: 20 }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: { videos?: Record<string, unknown>[]; cursor?: number; has_more?: boolean };
        error?: { code?: string; message?: string };
      };
      const code = body.error?.code;
      if (!res.ok || (code && code !== "ok")) {
        if (code === "scope_not_authorized" || code === "access_token_invalid" || res.status === 401) {
          throw new Error(
            "TikTok stats need the video.list permission: add the Display API (video.list) to your TikTok app, then use \"Reconnect TikTok with stats\" on this page.",
          );
        }
        throw new Error(`TikTok: ${body.error?.message ?? code ?? res.status}`);
      }
      for (const v of body.data?.videos ?? []) {
        r.posts.push({
          platform: "tiktok",
          remoteId: String(v.id),
          createdAt: new Date((num(v.create_time) ?? 0) * 1000).toISOString(),
          kind: "reel",
          caption: typeof v.video_description === "string" ? v.video_description : null,
          title: typeof v.title === "string" && v.title ? v.title : null,
          durationSeconds: num(v.duration),
          permalink: typeof v.share_url === "string" ? v.share_url : null,
          metrics: { ...EMPTY_METRICS, views: num(v.view_count), likes: num(v.like_count), comments: num(v.comment_count), shares: num(v.share_count) },
          note: null,
        });
      }
      if (!body.data?.has_more) break;
      cursor = body.data.cursor;
    }
  } catch (err) {
    downgrade(r, "none", err instanceof Error ? err.message : String(err));
    return r;
  }
  downgrade(r, "partial", "TikTok's API gives views, likes, comments and shares - not watch time.");
  r.complete = true;
  return r;
}
