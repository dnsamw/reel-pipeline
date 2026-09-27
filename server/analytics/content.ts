import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { defaultConfig } from "../../src/config/config";
import { loadManifest, type ManifestEntry } from "../../src/render/manifest";
import { getPhrases, type Phrase } from "../../src/data/getPhrases";
import { getRecipe } from "../recipes";
import { probeMedia } from "../distribution/media";
import type { PublicationRecord } from "../publications";
import type { AccountPost, ContentPiece, PlatformResult, PostKind, StatsAccess, StatsPlatform } from "../../src/analytics/types";

/**
 * Turns account posts + the app's publication rows into content pieces:
 * - made in the app: one piece per reel/image, with every platform it went to
 *   and what the app knows about it (format, chapter, phrases, caption style)
 * - posted directly on a platform: one piece per post, described by what the
 *   platform returns (type, caption, length, time) plus any book phrases the
 *   caption mentions
 */

const ROOT = process.cwd();

// The whole phrase book is small; cached so a refresh doesn't hit Postgres per post.
let phraseCache: { at: number; phrases: Phrase[] } | null = null;
export async function allPhrases(): Promise<Phrase[]> {
  if (phraseCache && Date.now() - phraseCache.at < 10 * 60 * 1000) return phraseCache.phrases;
  const phrases = await getPhrases();
  phraseCache = { at: Date.now(), phrases };
  return phrases;
}

const durationCache = new Map<string, number | null>();
/** Video length in seconds via ffprobe (cached per file); null for images or missing files. */
export function durationOf(outputPath: string): number | null {
  if (durationCache.has(outputPath)) return durationCache.get(outputPath)!;
  const abs = resolve(ROOT, outputPath);
  let d: number | null = null;
  if (outputPath.toLowerCase().endsWith(".mp4") && existsSync(abs)) {
    try {
      d = probeMedia(abs).durationSeconds;
    } catch {
      d = null;
    }
  }
  durationCache.set(outputPath, d);
  return d;
}

/** Post Creator rows: template "post" now; older rows used the post template's id ("studypal-...") as template. */
const isPostTemplate = (template: string) => template === "post" || template.startsWith("studypal-");

const contentKey = (p: Pick<PublicationRecord, "batchId" | "template">) => `${p.template}:${p.batchId}`;

function formatName(template: string, batchId: string, isVideo: boolean): string {
  if (isPostTemplate(template)) {
    // "post:studypal-list-story-2026-09-26T16-14-40-749Z.png" -> "List Story"
    const base = (template === "post" ? batchId : template)
      .replace(/^post:/, "")
      .replace(/-\d{4}-\d{2}-\d{2}T[\d-]+Z?\.\w+$/, "")
      .replace(/\.\w+$/, "")
      .replace(/^studypal-/, "");
    const name = base
      .split("-")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
    return `${isVideo ? "Post reel" : "Image post"} · ${name || "post"}`;
  }
  return getRecipe(template)?.name ?? (/^\d+$/.test(template) ? `Composition ${template}` : "Custom recipe (deleted)");
}

function timeOfDay(hour: number): string {
  if (hour >= 5 && hour <= 11) return "morning";
  if (hour >= 12 && hour <= 16) return "afternoon";
  if (hour >= 17 && hour <= 20) return "evening";
  return "night";
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Share of Sinhala letters among all letters (hashtags ignored). */
function captionLanguage(caption: string | null): string | null {
  if (!caption) return null;
  const text = caption.replace(/#\S+/g, "");
  const sinhala = (text.match(/[඀-෿]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (sinhala + latin < 10) return null;
  const share = sinhala / (sinhala + latin);
  return share >= 0.6 ? "Mostly Sinhala" : share <= 0.2 ? "Mostly English" : "Mixed";
}

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");

/** Book phrases whose English text appears in a caption (posts made outside the app). */
function phrasesInCaption(caption: string | null, phrases: Phrase[]): Phrase[] {
  if (!caption) return [];
  const text = norm(caption);
  return phrases.filter((p) => p.phrase.length >= 8 && text.includes(norm(p.phrase).replace(/[.!?]+$/, "")));
}

const hashtagCount = (caption: string | null) => (caption ? (caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).length : null);

const PLATFORM_NAMES: Record<StatsPlatform, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

export type StoredPost = AccountPost & { fetchedAt: string | null };

/** Which stored post an app publish became. */
function findPost(pub: PublicationRecord, posts: Map<string, StoredPost>, tiktokLinks: Map<string, string>): StoredPost | undefined {
  if (pub.platform === "tiktok") {
    const id = tiktokLinks.get(pub.id);
    return id ? posts.get(`tiktok:${id}`) : undefined;
  }
  if (!pub.fbVideoId) return undefined;
  const direct = posts.get(`${pub.platform}:${pub.fbVideoId}`);
  if (direct) return direct;
  // Facebook photos: the row stores the photo id; the feed lists "<page>_<post>", which the stored permalink ends with.
  if (pub.platform === "facebook" && pub.fbPermalink) {
    for (const p of posts.values()) if (p.platform === "facebook" && pub.fbPermalink.endsWith(p.remoteId)) return p;
  }
  return undefined;
}

function unmatchedNote(pub: PublicationRecord, access: Map<string, StatsAccess>): string {
  const a = access.get(pub.platform as StatsPlatform);
  const name = PLATFORM_NAMES[pub.platform as StatsPlatform] ?? pub.platform;
  if (a && (!a.connected || a.level === "none")) return `${name} stats aren't available yet - see the ${name} card at the top.`;
  if (pub.platform === "tiktok") return "Still a draft (or not matched yet) - post it from your TikTok inbox, or link it by hand below.";
  return `Not found on ${name} - it was removed, or posted while a different account was connected.`;
}

function platformResult(post: StoredPost | undefined, pub: PublicationRecord | null, note: string | null): PlatformResult {
  return {
    postKey: post ? `${post.platform}:${post.remoteId}` : `pub:${pub!.id}`,
    publicationId: pub?.id ?? null,
    platform: (post?.platform ?? pub!.platform) as StatsPlatform,
    outcome: pub?.outcome ?? null,
    permalink: post?.permalink ?? pub?.fbPermalink ?? null,
    postedAt: post?.createdAt ?? pub!.publishedAt ?? pub!.createdAt,
    metrics: post ? post.metrics : null,
    fetchedAt: post?.fetchedAt ?? null,
    note: post?.note ?? note,
    score: null,
  };
}

function timeFields(iso: string) {
  const d = new Date(iso);
  return { firstPostedAt: d.toISOString(), weekday: WEEKDAYS[d.getDay()], timeOfDay: timeOfDay(d.getHours()) };
}

const trim = (s: string | null, n = 600) => (s && s.length > n ? `${s.slice(0, n)}…` : s);

export function buildContentPieces(
  pubs: PublicationRecord[],
  storedPosts: StoredPost[],
  tiktokLinks: Map<string, string>,
  access: StatsAccess[],
  phrases: Phrase[],
): ContentPiece[] {
  const published = pubs.filter((p) => p.status === "published");
  const manifest = Object.values(loadManifest(resolve(ROOT, defaultConfig.manifestPath)));
  const phrasesById = new Map(phrases.map((p) => [p.id, p]));
  const postsByKey = new Map(storedPosts.map((p) => [`${p.platform}:${p.remoteId}`, p]));
  const accessBy = new Map(access.map((a) => [a.platform, a]));
  const claimed = new Set<string>();

  // Made in the app: grouped per reel/image across platforms.
  const groups = new Map<string, PublicationRecord[]>();
  for (const p of published) groups.set(contentKey(p), [...(groups.get(contentKey(p)) ?? []), p]);

  const pieces: ContentPiece[] = [];
  for (const [key, rows] of groups) {
    rows.sort((a, b) => (a.publishedAt ?? a.createdAt).localeCompare(b.publishedAt ?? b.createdAt));
    const first = rows[0];
    const isVideo = first.outputPath.toLowerCase().endsWith(".mp4");
    const entry: ManifestEntry | undefined = isPostTemplate(first.template)
      ? undefined
      : manifest.find((e) => e.batchId === first.batchId && e.template === first.template);
    const used = (entry?.phraseIds ?? []).map((id) => phrasesById.get(id)).filter((p): p is Phrase => p != null);
    const meta = rows.find((r) => r.captionMeta)?.captionMeta ?? null;
    const caption = rows.find((r) => r.caption)?.caption ?? null;

    const platforms = rows.map((r) => {
      const post = findPost(r, postsByKey, tiktokLinks);
      if (post) claimed.add(`${post.platform}:${post.remoteId}`);
      return platformResult(post, r, post ? null : unmatchedNote(r, accessBy));
    });

    pieces.push({
      key,
      kind: isVideo ? "reel" : "photo",
      source: isPostTemplate(first.template) ? "post" : "batch",
      format: formatName(first.template, first.batchId, isVideo),
      caption: trim(caption),
      title: null,
      captionLanguage: captionLanguage(caption),
      series: null,
      chapter: entry?.chapterTitle ?? null,
      phrases: used.map((p) => p.phrase),
      durationSeconds: isVideo ? durationOf(first.outputPath) : null,
      tts: entry ? entry.ttsEnabled : null,
      captionEngine: meta?.engine ?? null,
      tone: meta?.tone ?? null,
      hookId: meta?.hookId ?? null,
      captionLength: caption?.length ?? null,
      hashtagCount: hashtagCount(caption),
      ...timeFields(first.publishedAt ?? first.createdAt),
      platforms,
      score: null,
      totalViews: null,
      engagementRate: null,
      avgWatchPct: null,
    });
  }

  // Posted directly on a platform.
  for (const post of storedPosts) {
    const key = `${post.platform}:${post.remoteId}`;
    if (claimed.has(key)) continue;
    const found = phrasesInCaption(post.caption, phrases);
    const chapters = [...new Set(found.map((p) => p.chapterTitle))];
    pieces.push({
      key: `ext:${key}`,
      kind: post.kind as PostKind,
      source: "external",
      format: null,
      caption: trim(post.caption),
      title: post.title,
      captionLanguage: captionLanguage(post.caption),
      series: null,
      chapter: chapters.length === 1 ? chapters[0] : null,
      phrases: found.map((p) => p.phrase),
      durationSeconds: post.durationSeconds,
      tts: null,
      captionEngine: null,
      tone: null,
      hookId: null,
      captionLength: post.caption?.length ?? null,
      hashtagCount: hashtagCount(post.caption),
      ...timeFields(post.createdAt),
      platforms: [platformResult(post, null, null)],
      score: null,
      totalViews: null,
      engagementRate: null,
      avgWatchPct: null,
    });
  }

  assignSeries(pieces);
  return pieces.sort((a, b) => b.firstPostedAt.localeCompare(a.firstPostedAt));
}

/**
 * Series without AI: a caption's opening line with numbers, emoji, punctuation
 * and spacing stripped ("🇬🇧 මේ English Phrases 5 ගැන…" and "…Phrases 6…" match).
 * Only lines shared by 2+ posts count as a series; the label is the shortest version of that line.
 */
function assignSeries(pieces: ContentPiece[]): void {
  const firstLine = (p: ContentPiece) => (p.title ?? p.caption ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  const keyOf = (line: string) =>
    line
      .toLowerCase()
      .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}️‍]/gu, "")
      .replace(/[\p{N}\p{P}\p{S}]/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  const groups = new Map<string, ContentPiece[]>();
  for (const p of pieces) {
    const k = keyOf(firstLine(p));
    if (k.length >= 6) groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    // Label: the shortest version of the opening line, numbers kept out so it reads as the series' name.
    const label = members
      .map((m) => firstLine(m).replace(/\s*\d+\s*/g, " ").replace(/\s+/g, " ").trim())
      .sort((a, b) => a.length - b.length)[0]
      .slice(0, 70);
    for (const m of members) m.series = label;
  }
}

/** Phrase ids already used - in a published batch reel, or named in any post's caption. */
export function usedPhraseIds(pubs: PublicationRecord[], posts: AccountPost[], phrases: Phrase[]): Set<string> {
  const manifest = Object.values(loadManifest(resolve(ROOT, defaultConfig.manifestPath)));
  const ids = new Set<string>();
  for (const p of pubs) {
    if (p.status !== "published" || isPostTemplate(p.template)) continue;
    const e = manifest.find((m) => m.batchId === p.batchId && m.template === p.template);
    for (const id of e?.phraseIds ?? []) ids.add(id);
  }
  for (const post of posts) for (const p of phrasesInCaption(post.caption, phrases)) ids.add(p.id);
  return ids;
}
