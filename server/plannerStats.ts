import { db } from "./db";
import { getConnectedPage } from "./facebook";
import { listPlatformPosts, savePlatformPosts } from "./analytics/store";
import type { AccountPost, PostKind as StatsKind } from "../src/analytics/types";
import { addDays, getPost, normLine, postTargets, todaySriLanka, updatePost, type PlannerPlatform, type PlannerPost, type PostStatus } from "./planner";
import { platformCaption } from "./platformCaptions";

/**
 * P3 (studypal-lms docs/16 §7): which Facebook post a Planner post went out
 * as, so its stats land on the right row. Facebook posts come from the
 * read-only Graph API refresh (Insights) or, as a fallback, from the posts CSV
 * exported in Meta Business Suite. Nothing here posts anything.
 */

// --- CSV (Meta Business Suite → Insights → Content → Export) ---

/** RFC 4180: quoted fields may hold commas, quotes ("") and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

/** Business Suite writes "Publish time" in US Pacific time (checked 2026-11-18 against the Graph API times). */
export const CSV_TIME_ZONE = "America/Los_Angeles";

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(utcMs))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** "10/09/2026 19:45" in `timeZone` → ISO UTC, or null. */
export function csvTimeToIso(value: string, timeZone = CSV_TIME_ZONE): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) (\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const wall = Date.UTC(+m[3], +m[1] - 1, +m[2], +m[4], +m[5]);
  let utc = wall - zoneOffsetMs(wall, timeZone);
  utc = wall - zoneOffsetMs(utc, timeZone); // second pass settles daylight-saving edges
  return new Date(utc).toISOString();
}

const numOrNull = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface CsvImportResult {
  rows: number;
  imported: number;
  /** Rows that already existed from the Graph API (their numbers were refreshed). */
  known: number;
  skipped: number;
  match: MatchResult;
}

/**
 * Imports the posts CSV into platform_posts (+ a metrics snapshot each), so
 * Insights and the Planner see the same posts as the API would give. Rows are
 * keyed like the API: reels by video id (from the permalink), other posts as
 * "<page id>_<post id>".
 */
export function importFacebookCsv(text: string): CsvImportResult {
  const table = parseCsv(text);
  if (table.length < 2) throw new Error("The CSV has no rows");
  const head = table[0].map((h) => h.trim());
  const col = (name: string) => head.indexOf(name);
  for (const need of ["Post ID", "Publish time", "Permalink"]) if (col(need) < 0) throw new Error(`Not a Business Suite posts export: no "${need}" column`);
  const get = (r: string[], name: string) => (col(name) >= 0 ? r[col(name)] : undefined);

  const existing = listPlatformPosts().filter((p) => p.platform === "facebook");
  const byId = new Map(existing.map((p) => [p.remoteId, p]));
  const pageId = getConnectedPage()?.id ?? null;
  const posts: AccountPost[] = [];
  let known = 0;
  let skipped = 0;
  const seen = new Set<string>();

  for (const r of table.slice(1)) {
    const postId = (get(r, "Post ID") ?? "").trim();
    const createdAt = csvTimeToIso(get(r, "Publish time") ?? "");
    const permalink = (get(r, "Permalink") ?? "").trim() || null;
    const date = (get(r, "Date") ?? "Lifetime").trim();
    if (!postId || !createdAt || (date && date !== "Lifetime")) {
      skipped++;
      continue;
    }
    const video = permalink ? /\/(?:reel|videos)\/(\d+)/.exec(permalink)?.[1] : undefined;
    const type = (get(r, "Post type") ?? "").toLowerCase();
    const kind: StatsKind = permalink?.includes("/reel/") ? "reel" : video ? "video" : type.startsWith("photo") ? "photo" : type.includes("album") ? "carousel" : "text";
    let remoteId =
      (video && byId.has(video) && video) ||
      existing.find((p) => p.remoteId === postId || p.remoteId.endsWith(`_${postId}`))?.remoteId ||
      video ||
      (pageId ? `${pageId}_${postId}` : postId);
    if (seen.has(remoteId)) {
      skipped++;
      continue;
    }
    seen.add(remoteId);
    if (byId.has(remoteId)) known++;
    const avg = numOrNull(get(r, "Average Seconds viewed"));
    const duration = numOrNull(get(r, "Duration (sec)"));
    posts.push({
      platform: "facebook",
      remoteId,
      createdAt,
      kind,
      caption: get(r, "Description") || get(r, "Title") || null,
      title: null,
      durationSeconds: duration,
      permalink,
      metrics: {
        views: numOrNull(get(r, "Views")),
        reach: numOrNull(get(r, "Reach")),
        likes: numOrNull(get(r, "Reactions")),
        comments: numOrNull(get(r, "Comments")),
        shares: numOrNull(get(r, "Shares")),
        saves: null,
        avgWatchSeconds: avg,
        avgWatchPct: avg !== null && duration ? Math.min(100, (avg / duration) * 100) : null,
        followsGained: null,
      },
      note: byId.get(remoteId)?.note ?? "From the Business Suite CSV export",
    });
  }
  // complete=false: a CSV covers a date range, so it never removes other posts.
  if (posts.length) savePlatformPosts("facebook", posts, false, new Date().toISOString());
  return { rows: table.length - 1, imported: posts.length - known, known, skipped, match: matchPublished() };
}

// --- Matching Facebook posts to Planner posts ---

/** Posts that may have gone out (rejected/idea/drafted ones never did). */
const MATCHABLE: readonly PostStatus[] = ["approved", "rendered", "scheduled", "published", "measured"];
/** Stats are read as final this many days after the post. */
export const MEASURED_AFTER_DAYS = 7;
/** Caption overlap needed to call two posts the same. */
const MIN_SCORE = 0.6;

const words = (s: string | null | undefined) => new Set(normLine(s ?? "").split(" ").filter((w) => w.length > 1));

/** Share of the shorter caption's words found in the other one (0-1). */
export function captionScore(a: string | null | undefined, b: string | null | undefined): number {
  const A = words(a);
  const B = words(b);
  if (A.size < 3 || B.size < 3) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size);
}

const sriLankaDay = (iso: string) => todaySriLanka(new Date(iso));

export interface MatchResult {
  /** Newly linked: Planner post → Facebook post. */
  linked: { postId: string; remoteId: string; score: number }[];
  /** Linked posts whose status moved on (published → measured, …). */
  updated: number;
  /** Planner posts from past days that went out (scheduled/published) but have no Facebook post yet. */
  missing: { postId: string; date: string; slotId: string | null; title: string }[];
  /** P6: newly linked posts on Instagram, TikTok and YouTube. */
  linkedOther: { postId: string; platform: PlannerPlatform; remoteId: string; score: number }[];
}

export function nextStatus(p: Pick<PlannerPost, "status" | "date">, hasMetrics: boolean, today = todaySriLanka()): PostStatus {
  const old = !!p.date && addDays(p.date, MEASURED_AFTER_DAYS) <= today;
  if (old && hasMetrics) return "measured";
  return p.status === "measured" ? "measured" : "published";
}

/**
 * Links Planner posts to Facebook posts by day (±1 Sri Lanka day) and
 * caption, best pairs first, then moves their status to published / measured.
 * Already linked posts keep their link (an owner can unlink in the editor).
 */
export function matchPublished(today = todaySriLanka()): MatchResult {
  const fb = listPlatformPosts().filter((p) => p.platform === "facebook");
  const fbById = new Map(fb.map((p) => [p.remoteId, p]));
  const rows = db
    .prepare(`SELECT id FROM planner_posts WHERE date IS NOT NULL AND date <= ? AND status IN (${MATCHABLE.map(() => "?").join(",")})`)
    .all(today, ...MATCHABLE) as { id: string }[];
  const posts = rows.map((r) => getPost(r.id)!).filter(Boolean);
  const taken = new Set(posts.map((p) => p.remoteId).filter((x): x is string => !!x));

  const pairs: { post: PlannerPost; remoteId: string; score: number; gap: number }[] = [];
  for (const post of posts) {
    if (post.remoteId || !post.date) continue;
    for (const f of fb) {
      if (taken.has(f.remoteId)) continue;
      const day = sriLankaDay(f.createdAt);
      if (day < addDays(post.date, -1) || day > addDays(post.date, 1)) continue;
      const score = captionScore(post.caption, f.caption);
      if (score >= MIN_SCORE) pairs.push({ post, remoteId: f.remoteId, score, gap: day === post.date ? 0 : 1 });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.gap - b.gap);

  const result: MatchResult = { linked: [], updated: 0, missing: [], linkedOther: [] };
  const done = new Set<string>();
  for (const pr of pairs) {
    if (done.has(pr.post.id) || taken.has(pr.remoteId)) continue;
    done.add(pr.post.id);
    taken.add(pr.remoteId);
    pr.post.remoteId = pr.remoteId;
    result.linked.push({ postId: pr.post.id, remoteId: pr.remoteId, score: Math.round(pr.score * 100) / 100 });
  }

  for (const post of posts) {
    if (!post.remoteId) continue;
    const f = fbById.get(post.remoteId);
    if (!f) continue;
    const hasMetrics = Object.values(f.metrics).some((v) => v !== null);
    const status = nextStatus(post, hasMetrics, today);
    const linkedNow = done.has(post.id);
    if (!linkedNow && status === post.status) continue;
    updatePost(
      post.id,
      {
        remoteId: post.remoteId,
        status,
        statusReason: status !== post.status ? `Matched to Facebook post ${f.permalink ?? f.remoteId}` : post.statusReason,
        // A published post needs its media; when the file isn't kept, the Facebook post is the media.
        mediaPath: post.mediaPath.trim() || f.permalink || `facebook:${f.remoteId}`,
      },
      "stats",
    );
    if (!linkedNow) result.updated++;
  }

  for (const post of posts)
    if (!post.remoteId && post.date && post.date < today && (post.status === "scheduled" || post.status === "published"))
      result.missing.push({ postId: post.id, date: post.date, slotId: post.slotId, title: post.title });
  result.linkedOther = matchOtherPlatforms(posts.map((p) => getPost(p.id)!).filter(Boolean));
  return result;
}

type OtherPlatform = Exclude<PlannerPlatform, "facebook">;
const OTHER: OtherPlatform[] = ["instagram", "tiktok", "youtube"];

/**
 * P6: links Planner posts to their copies on Instagram, TikTok and YouTube
 * (posted by hand), the same way as Facebook: ±1 Sri Lanka day and caption
 * overlap (YouTube: title or description). Only for platforms the post goes
 * to. The links feed What worked per platform; the post's status still
 * follows Facebook.
 */
export function matchOtherPlatforms(posts: PlannerPost[]): MatchResult["linkedOther"] {
  const out: MatchResult["linkedOther"] = [];
  const all = listPlatformPosts();
  for (const platform of OTHER) {
    const remote = all.filter((p) => p.platform === platform);
    const taken = new Set(posts.map((p) => p.remoteIds?.[platform]).filter((x): x is string => !!x));
    const pairs: { post: PlannerPost; remoteId: string; score: number; gap: number }[] = [];
    for (const post of posts) {
      if (!post.date || post.remoteIds?.[platform] || !postTargets(post).includes(platform)) continue;
      const mine = platformCaption(post, platform);
      for (const f of remote) {
        if (taken.has(f.remoteId)) continue;
        const day = sriLankaDay(f.createdAt);
        if (day < addDays(post.date, -1) || day > addDays(post.date, 1)) continue;
        const score = Math.max(captionScore(mine.caption, f.caption), mine.title ? captionScore(mine.title, f.title) : 0, captionScore(mine.caption, f.title));
        if (score >= MIN_SCORE) pairs.push({ post, remoteId: f.remoteId, score, gap: day === post.date ? 0 : 1 });
      }
    }
    pairs.sort((a, b) => b.score - a.score || a.gap - b.gap);
    const done = new Set<string>();
    for (const pr of pairs) {
      if (done.has(pr.post.id) || taken.has(pr.remoteId)) continue;
      done.add(pr.post.id);
      taken.add(pr.remoteId);
      const cur = getPost(pr.post.id);
      if (!cur) continue;
      const remoteIds = { ...cur.remoteIds, [platform]: pr.remoteId };
      updatePost(cur.id, { remoteIds }, "stats");
      pr.post.remoteIds = remoteIds;
      out.push({ postId: cur.id, platform, remoteId: pr.remoteId, score: Math.round(pr.score * 100) / 100 });
    }
  }
  return out;
}

/** Stats for the Planner page: linked Facebook posts' permalink + latest numbers. */
export function plannerPostStats(posts: PlannerPost[]): Record<string, { permalink: string | null; createdAt: string; metrics: AccountPost["metrics"] }> {
  const ids = new Set(posts.map((p) => p.remoteId).filter(Boolean));
  if (ids.size === 0) return {};
  const out: Record<string, { permalink: string | null; createdAt: string; metrics: AccountPost["metrics"] }> = {};
  for (const f of listPlatformPosts()) if (f.platform === "facebook" && ids.has(f.remoteId)) out[f.remoteId] = { permalink: f.permalink, createdAt: f.createdAt, metrics: f.metrics };
  return out;
}
