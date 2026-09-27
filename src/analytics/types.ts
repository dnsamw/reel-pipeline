// Shared by server/analytics/ and the GUI's Insights page. Type-only.

export type StatsPlatform = "facebook" | "instagram" | "youtube" | "tiktok";

export type PostKind = "reel" | "video" | "photo" | "carousel" | "text";

/** One post on a connected account - whether the app published it or it was posted directly on the platform. */
export interface AccountPost {
  platform: StatsPlatform;
  remoteId: string;
  createdAt: string;
  kind: PostKind;
  caption: string | null;
  /** YouTube title. */
  title: string | null;
  durationSeconds: number | null;
  permalink: string | null;
  metrics: PostMetrics;
  /** Why it's limited (private, not scored...). */
  note: string | null;
}

/** Whatever a platform returned for one post - null = not available (permission, format, or the platform doesn't report it). */
export interface PostMetrics {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  /** Average seconds watched per view (videos). */
  avgWatchSeconds: number | null;
  /** Average % of the video watched, 0-100 (videos). */
  avgWatchPct: number | null;
  followsGained: number | null;
}

/** How much a platform lets us measure right now, and what to do about the rest. */
export interface StatsAccess {
  platform: StatsPlatform;
  connected: boolean;
  /** full = views + watch time; partial = likes/comments/views only; none = nothing readable. */
  level: "full" | "partial" | "none";
  /** What's missing and how to fix it, in plain words. null when full. */
  fix: string | null;
}

export interface PlatformResult {
  /** "<platform>:<remote id>" for a post found on the account; "pub:<id>" for an app publish that wasn't found. */
  postKey: string;
  /** Set when the app published it (needed to link TikTok drafts by hand). */
  publicationId: string | null;
  platform: StatsPlatform;
  outcome: string | null;
  permalink: string | null;
  postedAt: string;
  /** Latest snapshot, null if never fetched or not measurable (TikTok draft not yet linked, private YouTube...). */
  metrics: PostMetrics | null;
  fetchedAt: string | null;
  /** Why this one isn't measured / is limited. */
  note: string | null;
  /** 0-100: how this post did against your other posts on the same platform (null = not enough to compare). */
  score: number | null;
}

/**
 * One piece of content. Made in the app: every platform it was published to.
 * Posted directly on a platform ("external"): that one post - the app knows
 * only what the platform says (type, caption, length, time).
 */
export interface ContentPiece {
  key: string;
  kind: PostKind;
  source: "batch" | "post" | "external";
  /** "Classic" / "Side-by-side" / "Reversed" / a custom recipe or post template name; null for posts made outside the app. */
  format: string | null;
  /** Caption as posted (first platform's), trimmed. */
  caption: string | null;
  title: string | null;
  /** "Mostly Sinhala" / "Mostly English" / "Mixed". */
  captionLanguage: string | null;
  /** Recurring series this post belongs to - posts whose captions open with the same line (numbers/emoji ignored); null = one-off. */
  series: string | null;
  chapter: string | null;
  phrases: string[];
  durationSeconds: number | null;
  tts: boolean | null;
  captionEngine: string | null;
  tone: string | null;
  hookId: string | null;
  captionLength: number | null;
  hashtagCount: number | null;
  firstPostedAt: string;
  weekday: string;
  /** "morning" 5-11, "afternoon" 12-16, "evening" 17-20, "night" 21-4 - local time of the server. */
  timeOfDay: string;
  platforms: PlatformResult[];
  /** Mean of the platform scores that exist. */
  score: number | null;
  /** Total views across platforms that report views. */
  totalViews: number | null;
  /** (likes+comments+shares+saves) / views across platforms, 0-100. */
  engagementRate: number | null;
  avgWatchPct: number | null;
}

export interface GroupStat {
  value: string;
  n: number;
  avgScore: number | null;
  avgWatchPct: number | null;
  avgEngagement: number | null;
}

export interface Comparison {
  dimension: string;
  label: string;
  groups: GroupStat[];
}

export interface BuiltinSuggestion {
  kind: "do-more" | "try" | "coverage" | "fix" | "data";
  text: string;
  confidence: "low" | "medium" | "high";
}

export interface BaselinePrediction {
  format: string;
  tone: string;
  timeOfDay: string;
  /** Expected score 0-100 from past averages, shrunk towards the overall mean when evidence is thin. */
  expectedScore: number;
  basedOn: number;
}

export interface ChapterCoverage {
  chapterOrder: number;
  chapter: string;
  totalPhrases: number;
  postedPhrases: number;
}

export interface InsightsOverview {
  refreshedAt: string | null;
  refreshing: boolean;
  access: StatsAccess[];
  contents: ContentPiece[];
  comparisons: Comparison[];
  suggestions: BuiltinSuggestion[];
  predictions: BaselinePrediction[];
  coverage: ChapterCoverage[];
  /** Posts that count for comparisons (measured, at least a day old). */
  measuredCount: number;
}

// --- AI (Kimi) report ---

export interface AiPhraseRef {
  id: string;
  english: string;
  sinhala: string | null;
  chapter: string;
}

export interface AiContentIdea {
  title: string;
  format: string;
  tone: string | null;
  platforms: string[];
  phrases: AiPhraseRef[];
  hook: string | null;
  postTime: string | null;
  expected: "above" | "average" | "below" | null;
  why: string;
}

export interface AiReport {
  summary: string;
  confidence: "low" | "medium" | "high";
  insights: { title: string; detail: string; evidence: string | null; confidence: "low" | "medium" | "high" }[];
  predictions: { idea: string; platform: string | null; expected: "above" | "average" | "below"; why: string }[];
  nextContent: AiContentIdea[];
  experiments: { hypothesis: string; how: string; measure: string }[];
  warnings: string[];
}

export interface AiReportRecord {
  id: string;
  createdAt: string;
  status: "running" | "done" | "error";
  model: string | null;
  focus: string | null;
  report: AiReport | null;
  error: string | null;
  /** How many content pieces / measured posts the report was based on. */
  contentCount: number;
  measuredCount: number;
}
