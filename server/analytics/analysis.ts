import type {
  BaselinePrediction,
  BuiltinSuggestion,
  ChapterCoverage,
  Comparison,
  ContentPiece,
  GroupStat,
  PostMetrics,
  StatsAccess,
} from "../../src/analytics/types";
import type { Phrase } from "../../src/data/getPhrases";

/**
 * The built-in (no AI) analysis. Deliberately simple and explainable:
 * - a post's score = its percentile among your own posts on the same
 *   platform (views, or interactions where views aren't available), so
 *   platforms with very different audience sizes can be compared
 * - comparisons = average score per value of one attribute (tone, format...)
 * - suggestions/predictions only claim what the numbers support, with the
 *   sample size turned into a confidence label
 */

/** Posts count once they've had a few hours to be seen - early enough that a post going viral right now still counts. */
const MIN_AGE_MS = 6 * 60 * 60 * 1000;
/** A platform's posts are only ranked once at least one has this many views (or interactions). */
const MIN_VALUE_TO_RANK = 20;

const PLATFORM_NAMES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

function interactions(m: PostMetrics): number | null {
  const parts = [m.likes, m.comments, m.shares, m.saves].filter((v): v is number => v != null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) : null;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function confidenceFor(n: number): "low" | "medium" | "high" {
  return n >= 10 ? "high" : n >= 5 ? "medium" : "low";
}

/** Fills scores/totals in place. Returns how many posts counted for comparisons. */
export function scorePieces(pieces: ContentPiece[], now = Date.now()): number {
  // Compared within a platform AND a measure: posts with views against each other, posts with only
  // interactions (e.g. Facebook photos without read_insights) against each other - never mixed.
  const byPlatform = new Map<string, { pr: ContentPiece["platforms"][number]; value: number }[]>();
  for (const piece of pieces) {
    for (const pr of piece.platforms) {
      const m = pr.metrics;
      if (!m || pr.note?.startsWith("Private")) continue;
      if (now - Date.parse(pr.postedAt) < MIN_AGE_MS) continue;
      const value = m.views ?? interactions(m);
      if (value == null) continue;
      const group = `${pr.platform}:${m.views != null ? "views" : "interactions"}`;
      byPlatform.set(group, [...(byPlatform.get(group) ?? []), { pr, value }]);
    }
  }

  let measured = 0;
  for (const list of byPlatform.values()) {
    // A platform where nothing has taken off yet (e.g. every Short under 20 views): ranking noise isn't a score.
    if (Math.max(...list.map((i) => i.value)) < MIN_VALUE_TO_RANK) continue;
    for (const item of list) {
      measured++;
      if (list.length === 1) {
        item.pr.score = 50;
        continue;
      }
      const below = list.filter((o) => o.value < item.value).length;
      const equal = list.filter((o) => o.value === item.value).length - 1;
      item.pr.score = Math.round(((below + equal / 2) / (list.length - 1)) * 100);
    }
  }

  for (const piece of pieces) {
    const scores = piece.platforms.map((p) => p.score).filter((s): s is number => s != null);
    piece.score = scores.length ? Math.round(mean(scores)!) : null;
    const withViews = piece.platforms.filter((p) => p.metrics?.views != null);
    const views = withViews.reduce((a, p) => a + p.metrics!.views!, 0);
    piece.totalViews = withViews.length ? views : null;
    const inter = withViews.reduce((a, p) => a + (interactions(p.metrics!) ?? 0), 0);
    piece.engagementRate = views > 0 ? Math.round((inter / views) * 1000) / 10 : null;
    const watch = piece.platforms.map((p) => p.metrics?.avgWatchPct).filter((v): v is number => v != null);
    piece.avgWatchPct = watch.length ? Math.round(mean(watch)!) : null;
  }
  return measured;
}

function lengthBucket(s: number | null): string | null {
  if (s == null) return null;
  if (s <= 15) return "up to 15s";
  if (s <= 30) return "16-30s";
  if (s <= 60) return "31-60s";
  return "over 60s";
}

const KIND_LABELS: Record<string, string> = { reel: "Reel", video: "Video", photo: "Photo", carousel: "Carousel", text: "Text post" };

/** App format when known, otherwise the post type. */
export const formatOrKind = (p: ContentPiece) => p.format ?? `${KIND_LABELS[p.kind] ?? p.kind} (posted directly)`;

function captionLengthBucket(n: number | null): string | null {
  if (n == null || n === 0) return null;
  if (n < 100) return "Short (under 100 chars)";
  if (n <= 400) return "Medium (100-400)";
  return "Long (over 400)";
}

const DIMENSIONS: { dimension: string; label: string; value: (p: ContentPiece) => string | null }[] = [
  { dimension: "series", label: "Series", value: (p) => p.series ?? "One-off posts" },
  { dimension: "kind", label: "Post type", value: (p) => KIND_LABELS[p.kind] ?? p.kind },
  { dimension: "source", label: "Made", value: (p) => (p.source === "external" ? "Posted directly" : "In this app") },
  { dimension: "format", label: "Format (app posts)", value: (p) => p.format },
  { dimension: "captionLanguage", label: "Caption language", value: (p) => p.captionLanguage },
  { dimension: "captionLength", label: "Caption length", value: (p) => captionLengthBucket(p.captionLength) },
  { dimension: "hashtags", label: "Hashtags", value: (p) => (p.hashtagCount == null ? null : p.hashtagCount === 0 ? "None" : p.hashtagCount <= 4 ? "1-4" : "5+") },
  { dimension: "tone", label: "Caption tone", value: (p) => p.tone },
  { dimension: "hookId", label: "Caption opening line", value: (p) => p.hookId },
  { dimension: "captionEngine", label: "Caption written by", value: (p) => (p.captionEngine === "ai" ? "AI" : p.captionEngine === "builtin" ? "Built-in" : p.captionEngine ? "By hand" : null) },
  { dimension: "chapter", label: "Chapter", value: (p) => p.chapter },
  { dimension: "timeOfDay", label: "Time posted", value: (p) => p.timeOfDay },
  { dimension: "weekday", label: "Day posted", value: (p) => p.weekday },
  { dimension: "length", label: "Video length", value: (p) => lengthBucket(p.durationSeconds) },
  { dimension: "phraseCount", label: "Phrases per reel", value: (p) => (p.phrases.length ? (p.phrases.length >= 3 ? "3+" : String(p.phrases.length)) : null) },
  { dimension: "tts", label: "Narration", value: (p) => (p.tts == null ? null : p.tts ? "Voiced" : "Music only") },
];

export function compare(pieces: ContentPiece[]): Comparison[] {
  const scored = pieces.filter((p) => p.score != null);
  const out: Comparison[] = [];
  for (const d of DIMENSIONS) {
    const groups = new Map<string, ContentPiece[]>();
    for (const p of scored) {
      const v = d.value(p);
      if (v) groups.set(v, [...(groups.get(v) ?? []), p]);
    }
    if (groups.size < 2) continue;
    const stats: GroupStat[] = [...groups].map(([value, ps]) => ({
      value,
      n: ps.length,
      avgScore: mean(ps.map((p) => p.score!)),
      avgWatchPct: mean(ps.map((p) => p.avgWatchPct).filter((v): v is number => v != null)),
      avgEngagement: mean(ps.map((p) => p.engagementRate).filter((v): v is number => v != null)),
    }));
    stats.sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0));
    out.push({ dimension: d.dimension, label: d.label, groups: stats });
  }
  return out;
}

export function coverage(phrases: Phrase[], posted: Set<string>): ChapterCoverage[] {
  const byChapter = new Map<string, ChapterCoverage>();
  for (const p of phrases) {
    const c = byChapter.get(p.chapterId) ?? { chapterOrder: p.chapterOrder, chapter: p.chapterTitle, totalPhrases: 0, postedPhrases: 0 };
    c.totalPhrases++;
    if (posted.has(p.id)) c.postedPhrases++;
    byChapter.set(p.chapterId, c);
  }
  return [...byChapter.values()].sort((a, b) => a.chapterOrder - b.chapterOrder);
}

export function suggest(pieces: ContentPiece[], comparisons: Comparison[], cov: ChapterCoverage[], access: StatsAccess[], measured: number): BuiltinSuggestion[] {
  const out: BuiltinSuggestion[] = [];

  if (measured < 20) {
    out.push({
      kind: "data",
      confidence: "high",
      text: `${measured} post${measured === 1 ? "" : "s"} measured so far (posts count once they're 6 hours old). Patterns become reliable at about 20-30 posts - keep posting regularly and vary one thing at a time (tone, format, time).`,
    });
  }

  // Clear winners: best vs worst group, both with at least 2 posts, 15+ points apart.
  const wins = comparisons
    .map((c) => {
      const eligible = c.groups.filter((g) => g.n >= 2 && g.avgScore != null);
      if (eligible.length < 2) return null;
      const best = eligible[0];
      const worst = eligible[eligible.length - 1];
      const gap = best.avgScore! - worst.avgScore!;
      return gap >= 15 ? { c, best, worst, gap } : null;
    })
    .filter((w): w is NonNullable<typeof w> => w != null)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 4);
  for (const w of wins) {
    out.push({
      kind: "do-more",
      confidence: confidenceFor(Math.min(w.best.n, w.worst.n)),
      text: `${w.c.label}: "${w.best.value}" scores ${Math.round(w.best.avgScore!)} on average vs ${Math.round(w.worst.avgScore!)} for "${w.worst.value}" (${w.best.n} vs ${w.worst.n} posts). Do more "${w.best.value}".`,
    });
  }

  // Retention: where viewers drop off early.
  const watchByPlatform = new Map<string, number[]>();
  for (const p of pieces) for (const pr of p.platforms) if (pr.metrics?.avgWatchPct != null) watchByPlatform.set(pr.platform, [...(watchByPlatform.get(pr.platform) ?? []), pr.metrics.avgWatchPct]);
  for (const [platform, xs] of watchByPlatform) {
    const avg = mean(xs)!;
    if (avg < 50) {
      out.push({
        kind: "try",
        confidence: confidenceFor(xs.length),
        text: `On ${PLATFORM_NAMES[platform] ?? platform}, viewers watch ${Math.round(avg)}% of a reel on average. Show the phrase in the very first second, and try a shorter countdown so the reveal comes sooner.`,
      });
    }
  }

  // Untested variety - only once there's something to compare against.
  if (pieces.filter((p) => p.source !== "external").length >= 3) {
    const tones = new Set(pieces.map((p) => p.tone).filter(Boolean));
    const untested = ["friendly", "challenge", "teacher"].filter((t) => !tones.has(t));
    if (untested.length) out.push({ kind: "try", confidence: "low", text: `Caption tone${untested.length > 1 ? "s" : ""} not tried yet: ${untested.join(", ")}. Try each on a few posts so they can be compared.` });
  }

  const untouched = cov.filter((c) => c.postedPhrases === 0 && c.totalPhrases > 0).slice(0, 3);
  for (const c of untouched) out.push({ kind: "coverage", confidence: "high", text: `Chapter ${c.chapterOrder} "${c.chapter}" has ${c.totalPhrases} phrases that haven't been posted yet.` });

  for (const a of access) if (a.connected && a.level !== "full" && a.fix) out.push({ kind: "fix", confidence: "high", text: `${PLATFORM_NAMES[a.platform]}: ${a.fix}` });

  return out;
}

/**
 * Expected score for format x tone x time-of-day combinations: the overall
 * average plus each attribute's effect, where an effect from n posts is
 * shrunk by n/(n+3) - so one lucky post can't dominate the forecast.
 */
export function predict(pieces: ContentPiece[]): BaselinePrediction[] {
  const scored = pieces.filter((p) => p.score != null);
  if (scored.length < 3) return [];
  const overall = mean(scored.map((p) => p.score!))!;
  const effects = (key: (p: ContentPiece) => string | null) => {
    const m = new Map<string, { effect: number; n: number }>();
    const groups = new Map<string, number[]>();
    for (const p of scored) {
      const v = key(p);
      if (v) groups.set(v, [...(groups.get(v) ?? []), p.score!]);
    }
    for (const [v, xs] of groups) m.set(v, { effect: (mean(xs)! - overall) * (xs.length / (xs.length + 3)), n: xs.length });
    return m;
  };
  const fmt = effects(formatOrKind);
  const tone = effects((p) => p.tone);
  const time = effects((p) => p.timeOfDay);
  const out: BaselinePrediction[] = [];
  for (const [f, fe] of fmt)
    for (const [t, te] of tone.size ? tone : new Map([["any", { effect: 0, n: 0 }]]))
      for (const [h, he] of time) {
        out.push({
          format: f,
          tone: t,
          timeOfDay: h,
          expectedScore: Math.max(0, Math.min(100, Math.round(overall + fe.effect + te.effect + he.effect))),
          basedOn: Math.min(fe.n, te.n || fe.n, he.n),
        });
      }
  return out.sort((a, b) => b.expectedScore - a.expectedScore).slice(0, 5);
}
