import { AiLengthError, aiStatus, chat, parseJsonObject } from "../ai/client";
import { listRecipes } from "../recipes";
import type { Phrase } from "../../src/data/getPhrases";
import type { AiContentIdea, AiPhraseRef, AiReport, InsightsOverview } from "../../src/analytics/types";

/**
 * The "super brain": Kimi reads the measured posts, the built-in comparisons
 * and the unposted phrase catalogue, and returns analysis, predictions and a
 * concrete content plan. Optional by design - the Insights page's built-in
 * analysis works without it (see analysis.ts).
 */

const BRAND = [
  "StudyPal sells 'The Ultimate Sinhala-to-English Phrasebook' to Sri Lankans learning everyday spoken English.",
  "Content: short vertical quiz reels (an English phrase is shown, viewers guess the Sinhala meaning before a countdown reveals it; the 'Reversed' format shows the Sinhala and asks for the English), plus image posts (phrase lists, quotes).",
  "The same reel is usually posted to Facebook, Instagram, YouTube Shorts and TikTok. Goals, in order: watch-through/retention, follows, comments/saves/shares, then book sales.",
].join("\n");

const PLATFORM_NAMES: Record<string, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

const round = (v: number | null | undefined, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Unposted phrases, spread across chapters, with short ids the model must reference. */
function catalog(phrases: Phrase[], posted: Set<string>, minPerChapter = 6, max = 80): { refs: Map<string, AiPhraseRef>; rows: object[] } {
  const byChapter = new Map<string, Phrase[]>();
  for (const p of phrases) if (!posted.has(p.id)) byChapter.set(p.chapterId, [...(byChapter.get(p.chapterId) ?? []), p]);
  // Few chapters -> more from each, so a one-chapter book still offers plenty to choose from.
  const perChapter = Math.max(minPerChapter, Math.ceil(max / Math.max(1, byChapter.size)));
  const picked: Phrase[] = [];
  for (let i = 0; i < perChapter && picked.length < max; i++) {
    for (const list of byChapter.values()) if (list[i] && picked.length < max) picked.push(list[i]);
  }
  const refs = new Map<string, AiPhraseRef>();
  const rows = picked.map((p, i) => {
    const id = `p${i + 1}`;
    refs.set(id, { id: p.id, english: p.phrase, sinhala: p.translationSi, chapter: p.chapterTitle });
    return { id, english: p.phrase, sinhala: p.translationSi, chapter: `${p.chapterOrder}. ${p.chapterTitle}` };
  });
  return { refs, rows };
}

/** Most recent posts sent to the model, and how much of each caption. */
const MAX_POSTS = 150;
const CAPTION_CHARS = 350;

function dataset(overview: InsightsOverview, catalogRows: object[]) {
  const now = Date.now();
  return {
    measuredPosts: overview.measuredCount,
    statsAccess: overview.access.map((a) => ({ platform: a.platform, connected: a.connected, level: a.level })),
    // Newest first, capped so the request stays a sensible size; ids follow overview order (see readableIds).
    contents: overview.contents.slice(0, MAX_POSTS).map((c, i) => ({
      id: `c${i + 1}`,
      madeIn: c.source === "external" ? "posted directly on the platform" : "this app",
      format: c.format,
      kind: c.kind,
      title: c.title,
      series: c.series,
      chapter: c.chapter,
      phrasesFromBook: c.phrases,
      durationSeconds: round(c.durationSeconds),
      narration: c.tts,
      caption: {
        text: c.caption ? c.caption.slice(0, CAPTION_CHARS) : null,
        language: c.captionLanguage,
        length: c.captionLength,
        hashtags: c.hashtagCount,
        writtenBy: c.captionEngine,
        tone: c.tone,
        openingLineId: c.hookId,
      },
      posted: { weekday: c.weekday, timeOfDay: c.timeOfDay, daysAgo: round((now - Date.parse(c.firstPostedAt)) / 86_400_000) },
      score: c.score,
      totalViews: c.totalViews,
      engagementRatePct: c.engagementRate,
      avgWatchPct: c.avgWatchPct,
      platforms: c.platforms.map((p) => ({
        platform: p.platform,
        status: p.outcome ?? "live",
        score: p.score,
        note: p.note,
        ...(p.metrics
          ? Object.fromEntries(Object.entries(p.metrics).filter(([, v]) => v != null).map(([k, v]) => [k, round(v as number)]))
          : { metrics: "not measured" }),
      })),
    })),
    builtinComparisons: overview.comparisons.map((c) => ({
      attribute: c.label,
      groups: c.groups.map((g) => ({ value: g.value, posts: g.n, avgScore: round(g.avgScore), avgWatchPct: round(g.avgWatchPct), avgEngagementPct: round(g.avgEngagement) })),
    })),
    chapterCoverage: overview.coverage.map((c) => ({ chapter: `${c.chapterOrder}. ${c.chapter}`, phrases: c.totalPhrases, posted: c.postedPhrases })),
    availableFormats: [
      ...listRecipes().map((r) => `${r.name} (reel)`),
      "List Story (image post or post reel: several phrases with meanings)",
      "Quote (image post: one tip or quote)",
    ],
    unpostedPhraseCatalog: catalogRows,
  };
}

const REPORT_SHAPE = `{
  "summary": "3-5 sentences: where things stand and the single most important next move",
  "confidence": "low|medium|high - overall, honest about how much data there is",
  "insights": [{"title": "...", "detail": "...", "evidence": "the numbers behind it, or 'general short-form practice' if not from this data", "confidence": "low|medium|high"}],
  "predictions": [{"idea": "a specific kind of post", "platform": "facebook|instagram|youtube|tiktok|all", "expected": "above|average|below", "why": "..."}],
  "nextContent": [{"title": "...", "format": "one of availableFormats", "tone": "friendly|challenge|teacher", "platforms": ["..."], "phraseIds": ["p1", "p2"], "hook": "the first line / on-screen hook", "postTime": "e.g. Tuesday evening", "expected": "above|average|below", "why": "..."}],
  "experiments": [{"hypothesis": "...", "how": "exactly what to post, varying one thing", "measure": "which number decides it"}],
  "warnings": ["measurement gaps or risks, e.g. platforms not measured"]
}`;

/** The dataset's short ids ("c3" = a post, "p12" = a phrase) -> readable labels, for any text shown to the user. */
function readableIds(overview: InsightsOverview, refs: Map<string, AiPhraseRef>): (s: string) => string {
  const postLabels = new Map(
    overview.contents.map((c, i) => {
      const date = new Date(c.firstPostedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const what = c.format ?? `${PLATFORM_NAMES[c.platforms[0]?.platform] ?? ""} ${c.kind}`.trim();
      return [`c${i + 1}`, `the ${what} of ${date}`];
    }),
  );
  return (s) =>
    s
      .replace(/\b(?:the\s+)?(c\d+)\b/gi, (m, id: string) => postLabels.get(id.toLowerCase()) ?? m)
      .replace(/\bp\d+\b/g, (m) => (refs.get(m) ? `"${refs.get(m)!.english}"` : m));
}

const asConfidence = (v: unknown): "low" | "medium" | "high" => (v === "high" || v === "medium" ? v : "low");
const asExpected = (v: unknown): "above" | "average" | "below" => (v === "above" || v === "below" ? v : "average");
const arr = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object") : []);

/**
 * Validates the model's JSON; drops anything malformed and any phrase id that isn't in the catalogue.
 * Text goes through `readable` so the dataset's short ids become labels.
 */
function normalize(raw: Record<string, unknown>, readable: (s: string) => string, refs: Map<string, AiPhraseRef>): AiReport {
  const str = (v: unknown): string => (typeof v === "string" ? readable(v.trim()) : "");
  return {
    summary: str(raw.summary) || "No summary returned.",
    confidence: asConfidence(raw.confidence),
    insights: arr(raw.insights)
      .map((i) => ({ title: str(i.title), detail: str(i.detail), evidence: str(i.evidence) || null, confidence: asConfidence(i.confidence) }))
      .filter((i) => i.title),
    predictions: arr(raw.predictions)
      .map((p) => ({ idea: str(p.idea), platform: str(p.platform) || null, expected: asExpected(p.expected), why: str(p.why) }))
      .filter((p) => p.idea),
    nextContent: arr(raw.nextContent)
      .map(
        (n): AiContentIdea => ({
          title: str(n.title),
          format: str(n.format),
          tone: str(n.tone) || null,
          platforms: Array.isArray(n.platforms) ? n.platforms.map(String) : [],
          phrases: (Array.isArray(n.phraseIds) ? n.phraseIds : []).map((id) => refs.get(String(id))).filter((r): r is AiPhraseRef => r != null),
          hook: str(n.hook) || null,
          postTime: str(n.postTime) || null,
          expected: n.expected ? asExpected(n.expected) : null,
          why: str(n.why),
        }),
      )
      .filter((n) => n.title),
    experiments: arr(raw.experiments)
      .map((e) => ({ hypothesis: str(e.hypothesis), how: str(e.how), measure: str(e.measure) }))
      .filter((e) => e.hypothesis),
    warnings: (Array.isArray(raw.warnings) ? raw.warnings : []).map((w) => str(w)).filter(Boolean),
  };
}

export async function aiReport(overview: InsightsOverview, phrases: Phrase[], posted: Set<string>, focus: string | null): Promise<AiReport> {
  const { refs, rows } = catalog(phrases, posted);
  const data = dataset(overview, rows);

  const system = [
    "You are a growth strategist for short-form educational video, analysing a small creator's own post data.",
    BRAND,
    "Rules:",
    "- Base claims on the data given. Each post's `score` (0-100) is its percentile among the creator's own posts on that platform; compare within a platform, not raw views across platforms.",
    "- Be honest about sample size: with few posts, say so and keep confidence low. Where the data can't answer, you may use proven short-form practice, but label its evidence as 'general short-form practice'.",
    "- Posts marked private, draft or not measured are not evidence of performance.",
    "- Most posts were made outside this app (madeIn = 'posted directly'): the app doesn't know their format, so infer it from the caption text and title. Group posts into recurring series/themes you can recognise in the captions (e.g. numbered 'English Phrases N' lists, 'word of the day', Sinhala-to-English translation quizzes, idioms) and compare those series - this is usually the most useful finding.",
    "- One or two viral outliers can dominate raw views: say when a conclusion rests on a single post, and look at what the outlier did differently (topic, caption, hook, format, time).",
    "- nextContent must be concrete and ready to make, with a hook. When an idea uses the book's phrases, pick phraseIds only from unpostedPhraseCatalog (3 per reel unless the format suggests otherwise) and a format from availableFormats. When it continues a series that isn't built from the book (e.g. idioms), leave phraseIds empty, name the series as the format, and put the exact content in the title/hook. Lean towards whatever is already working. Give 4-6 ideas.",
    "- Give 3-5 insights, 3-6 predictions, 2-3 experiments that each vary exactly one thing.",
    "- Keep Sinhala text exactly as given; never invent Sinhala.",
    "Reply with only a JSON object in this shape:",
    REPORT_SHAPE,
  ].join("\n");

  const user = [focus ? `The creator especially wants to know: ${focus}` : "Give the full analysis and plan.", "", "DATA:", JSON.stringify(data)].join("\n");

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: user },
  ];
  let answer: string;
  try {
    // Thinking on: this is the one place the slower, deeper answer is worth it.
    answer = await chat(messages, { reasoningEffort: "high", temperature: 0.6, maxTokens: 32_000, timeoutMs: 10 * 60_000 });
  } catch (err) {
    // A big dataset can use up the budget on thinking alone - one retry that thinks less.
    if (!(err instanceof AiLengthError)) throw err;
    answer = await chat(messages, { reasoningEffort: "low", temperature: 0.6, maxTokens: 32_000, timeoutMs: 10 * 60_000 });
  }
  return normalize(parseJsonObject<Record<string, unknown>>(answer), readableIds(overview, refs), refs);
}

/** Free-form question about the data - answered in plain text (markdown). */
export async function aiAsk(overview: InsightsOverview, phrases: Phrase[], posted: Set<string>, question: string): Promise<string> {
  const { refs, rows } = catalog(phrases, posted, 3, 40);
  const answer = await chat(
    [
      {
        role: "system",
        content: [
          "You are a growth strategist for short-form educational video, answering the creator's question about their own post data.",
          BRAND,
          "Scores are percentiles among the creator's own posts on the same platform. Be concrete and brief (under 250 words), cite the numbers you rely on, and say plainly when the data is too thin to answer. Plain text or simple markdown lists only.",
        ].join("\n"),
      },
      { role: "user", content: `QUESTION: ${question}\n\nDATA:\n${JSON.stringify(dataset(overview, rows))}` },
    ],
    { reasoningEffort: "low", temperature: 0.5, maxTokens: 6000, timeoutMs: 5 * 60_000 },
  );
  return readableIds(overview, refs)(answer);
}

export { aiStatus };
