/** Mirrors server/planner.ts and server/lmsCatalog.ts (docs/16 in studypal-lms). */

export const POST_STATUSES = ["idea", "drafted", "approved", "rendered", "scheduled", "published", "measured", "rejected", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const STOCK_STATUSES: readonly PostStatus[] = ["approved", "rendered", "scheduled", "published", "measured"];

export const POST_KINDS = ["reel", "image", "carousel", "video"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export interface PlannerSlot {
  id: string;
  label: string;
  timeFrom: string;
  timeTo: string;
  kind: PostKind;
  note: string;
  sort: number;
  active: boolean;
}

export interface Pillar {
  id: string;
  name: string;
  subject: string;
  color: string;
  books: string[];
  landingPath: string;
  sharePct: number;
  slotIds: string[];
  needsOwner: boolean;
  note: string;
  sort: number;
  active: boolean;
}

/** The book lines a post uses (server/planner.ts PostSource). */
export interface PostSource {
  book?: string;
  unit?: string;
  unitTitle?: string;
  free?: boolean;
  lines?: { id: string; text: string }[];
}

export interface PlannerPost {
  id: string;
  date: string | null;
  slotId: string | null;
  reserve: boolean;
  pillarId: string | null;
  book: string;
  kind: PostKind;
  title: string;
  hook: string;
  caption: string;
  photo: string;
  mediaPath: string;
  source: PostSource;
  status: PostStatus;
  statusReason: string;
  autoApproved: boolean;
  notes: string;
  /** The Facebook post it went out as, once matched from the stats (P3). */
  remoteId: string | null;
  /** The last auto-approval review (P4). */
  review: PostReview | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockLevel {
  today: string;
  fullDays: number;
  streakDays: number;
  stockPosts: number;
  reservePosts: number;
  targetDays: number;
  level: "ok" | "warning" | "red";
  needsYou: number;
}

export interface CatalogBook {
  slug: string;
  no: number;
  subject: string;
  title: string;
  titleSi: string;
}

export interface PlannerView {
  today: string;
  from: string;
  to: string;
  slots: PlannerSlot[];
  pillars: Pillar[];
  posts: PlannerPost[];
  reserve: PlannerPost[];
  stock: StockLevel;
  mix: { pillarId: string; posts: number; pct: number; targetPct: number }[];
  books: CatalogBook[];
  /** Linked Facebook posts' numbers, by remoteId. */
  stats: Record<string, PostStats>;
  /** False = posting to Facebook from Studio is off (docs/16 §7). */
  facebookPosting: boolean;
}

export type PlannerPostInput = Partial<Omit<PlannerPost, "id" | "createdAt" | "updatedAt" | "autoApproved">>;

// --- Book content as post source (server/lmsCatalog.ts, P2) ---

export interface SourceUnit {
  id: string;
  title: string;
  titleSi: string;
  free: boolean;
  count: number | null;
}

export interface BookOutline {
  book: CatalogBook;
  groups: { id: string; title: string; units: SourceUnit[] }[];
}

export const SOURCE_LINE_KINDS = ["phrase", "mistake", "example", "hook", "tip"] as const;
export type SourceLineKind = (typeof SOURCE_LINE_KINDS)[number];

export interface SourceLine {
  id: string;
  kind: SourceLineKind;
  text: string;
  say: string;
  meaning: string;
  note: string;
  wrong?: string;
}

/** Another post that already uses a line or photo inside the repeat window. */
export interface Repeat {
  kind: "line" | "photo";
  value: string;
  postId: string;
  date: string | null;
  slotId: string | null;
  title: string;
}

export type SourceLineWithUse = SourceLine & { usedBy: Repeat | null };

export interface SourcePick {
  book: string;
  unit: string;
  unitTitle: string;
  free: boolean;
  lines: SourceLine[];
}

// --- Week pack + stats (P3) ---

export interface PostStats {
  permalink: string | null;
  createdAt: string;
  metrics: {
    views: number | null;
    reach: number | null;
    likes: number | null;
    comments: number | null;
    shares: number | null;
    saves: number | null;
    avgWatchSeconds: number | null;
    avgWatchPct: number | null;
    followsGained: number | null;
  };
}

export interface PackItem {
  n: number;
  postId: string;
  date: string;
  time: string;
  slotId: string;
  kind: string;
  title: string;
  caption: string;
  media: string;
  file: string;
  comment: { variant: string; text: string; image: string | null } | null;
}

export interface PackPlan {
  from: string;
  to: string;
  items: PackItem[];
  missing: { postId: string; date: string; slotId: string | null; title: string; reason: string }[];
  alreadyScheduled: number;
  /** Set once written. */
  dir?: string;
}

export interface MatchResult {
  linked: { postId: string; remoteId: string; score: number }[];
  updated: number;
  missing: { postId: string; date: string; slotId: string | null; title: string }[];
}

export interface CsvImportResult {
  rows: number;
  imported: number;
  known: number;
  skipped: number;
  match: MatchResult;
}

// --- Claude + Grok batch, auto-approval, photos (P4) ---

export interface PostReview {
  at: string;
  checks: { id: string; label: string; ok: boolean; detail?: string }[];
  scores: { hook: number; sinhala: number; accuracy: number; rules: number } | null;
  criticNotes: string;
  needsOwner: string[];
  grokNote?: string;
  approved: boolean;
}

export interface BatchEstimate {
  from: string;
  to: string;
  slots: number;
  /** New reserve posts Claude writes to bring the reserve to its target. */
  reserve: number;
  reserveNow: number;
  /** Pillars whose share the numbers moved (P5). */
  weights: { name: string; weight: number }[];
  claudeCalls: number;
  grokCalls: number;
  byPillar: Record<string, number>;
}

export interface BatchJob {
  id: string;
  from: string;
  to: string;
  state: "running" | "done" | "failed";
  startedAt: string;
  finishedAt: string | null;
  log: string[];
  created: number;
  drafted: number;
  approved: number;
  needsYou: number;
  rendered: number;
  reserveAdded: number;
  filledFromReserve: number;
  error: string | null;
}

// --- P5 feedback (server/planLearn.ts) ---

export type SampleKind = "reel" | "image";

export interface FeedbackSample {
  remoteId: string;
  permalink: string | null;
  at: string;
  day: string;
  minutes: number;
  kind: SampleKind;
  hook: string;
  style: string;
  views: number | null;
  reach: number | null;
  engagement: number | null;
  score: number;
  value: number;
  planner: { postId: string; pillarId: string | null; slotId: string | null; book: string } | null;
}

export interface FeedbackGroup {
  key: string;
  label: string;
  kind?: SampleKind;
  n: number;
  score: number;
  value: number;
  signal: boolean;
}

export interface FeedbackReport {
  from: string;
  to: string;
  days: number;
  samples: number;
  plannerSamples: number;
  scoreBy: Record<SampleKind, "views" | "reach" | "engagement" | null>;
  bySlot: FeedbackGroup[];
  byBand: FeedbackGroup[];
  byPillar: FeedbackGroup[];
  byStyle: FeedbackGroup[];
  byBook: FeedbackGroup[];
  top: FeedbackSample[];
  bottom: FeedbackSample[];
  weights: { pillarId: string; name: string; sharePct: number; weight: number; effectivePct: number; n: number }[];
  suggestions: { slotId: string; text: string }[];
  notes: string;
  minPosts: number;
  settleDays: number;
  reserve: { now: number; target: number };
}

export interface ScoutNote {
  id: string;
  topic: string;
  at: string;
  text: string;
}

export interface ScoutView {
  notes: ScoutNote[];
  topics: { id: string; label: string }[];
  running: { startedAt: string; log: string[] } | null;
}

export interface PhotoStock {
  folder: string;
  total: number;
  free: number;
  low: boolean;
}

export interface AiInfo {
  claude: { ok: boolean; version?: string; error?: string };
  grok: { ok: boolean; version?: string; error?: string };
  calls: { tool: string; calls: number; failed: number }[];
}

export interface PlannerRenderRun {
  from: string;
  to: string;
  startedAt: string;
  log: string[];
  done: boolean;
  rendered: number;
  skipped: { id: string; reason: string }[];
}
