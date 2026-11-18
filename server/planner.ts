import { randomUUID } from "node:crypto";
import { db } from "./db";
import { bookOutline, type SourceLine, type SourceLineKind, unitLines } from "./lmsCatalog";

/**
 * The Planner (studypal-lms/docs/16-social-content-pipeline.md): one row per
 * social post, on a day + slot, with a pillar (what it's about) and a status.
 * Posting itself is done by hand in Meta Business Suite (no Graph API
 * posting, docs/16 §7) - the statuses after `rendered` are ticked here.
 *
 * Dates are Sri Lanka calendar days ("YYYY-MM-DD", Asia/Colombo); slot times
 * are Sri Lanka local "HH:MM".
 */

export const POST_STATUSES = [
  "idea",
  "drafted",
  "approved",
  "rendered",
  "scheduled",
  "published",
  "measured",
  "rejected",
  "failed",
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Statuses that count as stock: the post will go out without more work from Claude. */
export const STOCK_STATUSES: readonly PostStatus[] = ["approved", "rendered", "scheduled", "published", "measured"];
/** Statuses that need a media file (the rendered image/video) to exist. */
const NEEDS_MEDIA: readonly PostStatus[] = ["rendered", "scheduled", "published", "measured"];

export const POST_KINDS = ["reel", "image", "carousel", "video"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export const isPostStatus = (s: unknown): s is PostStatus => POST_STATUSES.includes(s as PostStatus);
export const isPostKind = (k: unknown): k is PostKind => POST_KINDS.includes(k as PostKind);

export interface Slot {
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
  /** Target share of the week's posts, 0-100. */
  sharePct: number;
  /** Slots this pillar prefers (empty = any). */
  slotIds: string[];
  /** Never auto-approved (docs/16 §10.1): launch, offer, brand. */
  needsOwner: boolean;
  note: string;
  sort: number;
  active: boolean;
}

/** The book lines a post uses. Each line keeps its text, so the repeat guard works across export versions. */
export interface PostSource {
  book?: string;
  /** Section key or grammar lesson slug. */
  unit?: string;
  unitTitle?: string;
  /** The unit is free in the app (good for "try it" links). */
  free?: boolean;
  lines?: { id: string; text: string }[];
}

export interface PlannerPost {
  id: string;
  /** null = an evergreen reserve post with no day yet (docs/16 §7). */
  date: string | null;
  slotId: string | null;
  reserve: boolean;
  pillarId: string | null;
  /** Book slug from the LMS content export (e.g. "working-abroad", "korean-k4"), or "" for brand posts. */
  book: string;
  kind: PostKind;
  title: string;
  hook: string;
  caption: string;
  /** Background photo, relative to studypal-lms/social-media/stock-images/. */
  photo: string;
  /** Rendered media file (absolute or repo-relative path). */
  mediaPath: string;
  /** Where the content lines came from (docs/16 §4); `{}` for posts made by hand. */
  source: PostSource;
  status: PostStatus;
  /** Why it is not approved / was rejected / failed. */
  statusReason: string;
  autoApproved: boolean;
  notes: string;
  /** The Facebook post it went out as (platform_posts.remote_id), once matched from the stats (P3). */
  remoteId: string | null;
  /** The last auto-approval review (P4): code checks, critic scores, why it needs the owner. */
  review: PostReview | null;
  createdAt: string;
  updatedAt: string;
}

/** One auto-approval review (docs/16 §10.1). Approved on its own only when every check passes and nothing needs the owner. */
export interface PostReview {
  at: string;
  checks: { id: string; label: string; ok: boolean; detail?: string }[];
  /** Claude critic scores 1-5 (null when the critic didn't run). */
  scores: { hook: number; sinhala: number; accuracy: number; rules: number } | null;
  criticNotes: string;
  /** Things that always need the owner (brand post, AI image, a claim not in the book…). */
  needsOwner: string[];
  /** Grok's critique, attached as a note; never a gate. */
  grokNote?: string;
  approved: boolean;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS planner_slots (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    time_from TEXT NOT NULL,
    time_to TEXT NOT NULL,
    kind TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS planner_pillars (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subject TEXT NOT NULL,
    color TEXT NOT NULL,
    books_json TEXT NOT NULL DEFAULT '[]',
    landing_path TEXT NOT NULL DEFAULT '',
    share_pct REAL NOT NULL DEFAULT 0,
    slot_ids_json TEXT NOT NULL DEFAULT '[]',
    needs_owner INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    sort INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS planner_posts (
    id TEXT PRIMARY KEY,
    date TEXT,
    slot_id TEXT,
    reserve INTEGER NOT NULL DEFAULT 0,
    pillar_id TEXT,
    book TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    hook TEXT NOT NULL DEFAULT '',
    caption TEXT NOT NULL DEFAULT '',
    photo TEXT NOT NULL DEFAULT '',
    media_path TEXT NOT NULL DEFAULT '',
    source_json TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'idea',
    status_reason TEXT NOT NULL DEFAULT '',
    auto_approved INTEGER NOT NULL DEFAULT 0,
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS planner_posts_day ON planner_posts (date, slot_id);

  -- Every status change, so rejections (with reasons) can teach the next
  -- week's drafts (docs/16 §10.1).
  CREATE TABLE IF NOT EXISTS planner_post_events (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    by TEXT NOT NULL DEFAULT 'owner',
    at TEXT NOT NULL
  );
`);

// P3: the Facebook post a Planner post went out as.
if (!(db.prepare("PRAGMA table_info(planner_posts)").all() as { name: string }[]).some((c) => c.name === "remote_id"))
  db.exec("ALTER TABLE planner_posts ADD COLUMN remote_id TEXT");
// P4: the last auto-approval review.
if (!(db.prepare("PRAGMA table_info(planner_posts)").all() as { name: string }[]).some((c) => c.name === "review_json"))
  db.exec("ALTER TABLE planner_posts ADD COLUMN review_json TEXT");

// --- Defaults (docs/16 §3), seeded once into empty tables ---

const DEFAULT_SLOTS: Omit<Slot, "active">[] = [
  { id: "R1", label: "Morning reel", timeFrom: "06:00", timeTo: "09:00", kind: "reel", note: "growth, ≤ 10 s", sort: 1 },
  { id: "I1", label: "Midday image", timeFrom: "12:00", timeTo: "13:30", kind: "image", note: "practical, \"need it today\"", sort: 2 },
  { id: "R2", label: "Evening reel", timeFrom: "18:00", timeTo: "19:00", kind: "reel", note: "growth", sort: 3 },
  { id: "I2", label: "Evening image", timeFrom: "19:30", timeTo: "21:00", kind: "image", note: "emotional / curiosity, the shareable one; the streak slot", sort: 4 },
];

const DEFAULT_PILLARS: Omit<Pillar, "active">[] = [
  { id: "working-abroad", name: "Working Abroad", subject: "english", color: "#e8590c", books: ["working-abroad"], landingPath: "/english", sharePct: 12, slotIds: [], needsOwner: false, note: "Book 4. Embassy, interview and first-day-at-work lines. Lead English hook.", sort: 1 },
  { id: "travel", name: "Travel & tourism", subject: "english", color: "#1c7ed6", books: ["getting-things-done"], landingPath: "/english", sharePct: 8, slotIds: [], needsOwner: false, note: "Book 3. Airport, hotel, bank, clinic; English for people who work with tourists.", sort: 2 },
  { id: "situation-english", name: "Situation English", subject: "english", color: "#d6336c", books: ["just-start-talking", "everyday-english-foundations", "digital-life-ai-and-modern-world", "love-flirting-and-social-confidence", "standing-your-ground", "raising-kids-in-english", "silver-surfers"], landingPath: "/english", sharePct: 12, slotIds: ["I1", "I2"], needsOwner: false, note: "\"50 sentences for situation X\", one book per post, in turn. Never lead with book 8 (18+).", sort: 3 },
  { id: "phrase-reel", name: "Phrase reel", subject: "english", color: "#7048e8", books: [], landingPath: "/english", sharePct: 8, slotIds: ["R1", "R2"], needsOwner: false, note: "Guess-the-meaning reels from any phrase book.", sort: 4 },
  { id: "grammar", name: "Mistake / grammar", subject: "grammar", color: "#2f9e44", books: [], landingPath: "/grammar", sharePct: 15, slotIds: [], needsOwner: false, note: "12 Grammar Books; Mistake Clinic is the free hook.", sort: 5 },
  { id: "korean", name: "Go abroad: Korean", subject: "korean", color: "#0c8599", books: [], landingPath: "/korean", sharePct: 15, slotIds: [], needsOwner: false, note: "K1-K7, EPS-TOPIK.", sort: 6 },
  { id: "japanese", name: "Go abroad: Japanese", subject: "japanese", color: "#c92a2a", books: [], landingPath: "/japanese", sharePct: 15, slotIds: [], needsOwner: false, note: "J1-J7, JLPT N5/N4.", sort: 7 },
  { id: "monk", name: "Dhamma in English", subject: "monk", color: "#f08c00", books: ["dhamma-in-english"], landingPath: "/monk", sharePct: 5, slotIds: [], needsOwner: false, note: "The monk book.", sort: 8 },
  { id: "brand", name: "StudyPal app", subject: "brand", color: "#58238b", books: [], landingPath: "/", sharePct: 10, slotIds: [], needsOwner: true, note: "How to install, feature demos. Always needs the owner.", sort: 9 },
  { id: "launch", name: "Launch / offer", subject: "brand", color: "#fab005", books: [], landingPath: "/", sharePct: 0, slotIds: [], needsOwner: true, note: "Teasers and launch posts for a new book (docs/16 §8). Always needs the owner.", sort: 10 },
];

function seedDefaults(): void {
  const slotCount = (db.prepare("SELECT COUNT(*) AS n FROM planner_slots").get() as { n: number }).n;
  if (slotCount === 0) {
    const ins = db.prepare("INSERT INTO planner_slots (id, label, time_from, time_to, kind, note, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)");
    for (const s of DEFAULT_SLOTS) ins.run(s.id, s.label, s.timeFrom, s.timeTo, s.kind, s.note, s.sort);
  }
  const pillarCount = (db.prepare("SELECT COUNT(*) AS n FROM planner_pillars").get() as { n: number }).n;
  if (pillarCount === 0) {
    const ins = db.prepare(
      "INSERT INTO planner_pillars (id, name, subject, color, books_json, landing_path, share_pct, slot_ids_json, needs_owner, note, sort, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
    );
    for (const p of DEFAULT_PILLARS)
      ins.run(p.id, p.name, p.subject, p.color, JSON.stringify(p.books), p.landingPath, p.sharePct, JSON.stringify(p.slotIds), p.needsOwner ? 1 : 0, p.note, p.sort);
  }
}
seedDefaults();

// --- Rows <-> objects ---

interface SlotRow { id: string; label: string; time_from: string; time_to: string; kind: string; note: string; sort: number; active: number }
interface PillarRow { id: string; name: string; subject: string; color: string; books_json: string; landing_path: string; share_pct: number; slot_ids_json: string; needs_owner: number; note: string; sort: number; active: number }
interface PostRow {
  id: string; date: string | null; slot_id: string | null; reserve: number; pillar_id: string | null; book: string; kind: string;
  title: string; hook: string; caption: string; photo: string; media_path: string; source_json: string; status: string;
  status_reason: string; auto_approved: number; notes: string; remote_id: string | null; review_json: string | null; created_at: string; updated_at: string;
}

const toSlot = (r: SlotRow): Slot => ({
  id: r.id, label: r.label, timeFrom: r.time_from, timeTo: r.time_to, kind: isPostKind(r.kind) ? r.kind : "image",
  note: r.note, sort: r.sort, active: r.active === 1,
});

const toPillar = (r: PillarRow): Pillar => ({
  id: r.id, name: r.name, subject: r.subject, color: r.color, books: JSON.parse(r.books_json), landingPath: r.landing_path,
  sharePct: r.share_pct, slotIds: JSON.parse(r.slot_ids_json), needsOwner: r.needs_owner === 1, note: r.note, sort: r.sort,
  active: r.active === 1,
});

const toPost = (r: PostRow): PlannerPost => ({
  id: r.id, date: r.date, slotId: r.slot_id, reserve: r.reserve === 1, pillarId: r.pillar_id, book: r.book,
  kind: isPostKind(r.kind) ? r.kind : "image", title: r.title, hook: r.hook, caption: r.caption, photo: r.photo,
  mediaPath: r.media_path, source: JSON.parse(r.source_json), status: isPostStatus(r.status) ? r.status : "idea",
  statusReason: r.status_reason, autoApproved: r.auto_approved === 1, notes: r.notes, remoteId: r.remote_id ?? null, review: r.review_json ? (JSON.parse(r.review_json) as PostReview) : null, createdAt: r.created_at, updatedAt: r.updated_at,
});

// --- Dates (Sri Lanka) ---

/** Today's calendar date in Sri Lanka, "YYYY-MM-DD". */
export function todaySriLanka(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (s: unknown): s is string => {
  if (typeof s !== "string" || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; // refuses 2026-02-30
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// --- Slots and pillars ---

export function listSlots(): Slot[] {
  return (db.prepare("SELECT * FROM planner_slots ORDER BY sort, id").all() as SlotRow[]).map(toSlot);
}

export function listPillars(): Pillar[] {
  return (db.prepare("SELECT * FROM planner_pillars ORDER BY sort, id").all() as PillarRow[]).map(toPillar);
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,40}$/i;

export function savePillar(input: Partial<Pillar> & { id: string }): Pillar {
  if (!ID_RE.test(input.id)) throw new Error("Pillar id: letters, digits and dashes only");
  const cur = listPillars().find((p) => p.id === input.id);
  const p: Pillar = {
    id: input.id,
    name: (input.name ?? cur?.name ?? input.id).trim(),
    subject: (input.subject ?? cur?.subject ?? "english").trim(),
    color: input.color ?? cur?.color ?? "#58238b",
    books: input.books ?? cur?.books ?? [],
    landingPath: input.landingPath ?? cur?.landingPath ?? "",
    sharePct: Math.max(0, Math.min(100, Number(input.sharePct ?? cur?.sharePct ?? 0))),
    slotIds: input.slotIds ?? cur?.slotIds ?? [],
    needsOwner: input.needsOwner ?? cur?.needsOwner ?? false,
    note: input.note ?? cur?.note ?? "",
    sort: input.sort ?? cur?.sort ?? 99,
    active: input.active ?? cur?.active ?? true,
  };
  db.prepare(
    `INSERT INTO planner_pillars (id, name, subject, color, books_json, landing_path, share_pct, slot_ids_json, needs_owner, note, sort, active)
     VALUES (@id, @name, @subject, @color, @books, @landingPath, @sharePct, @slotIds, @needsOwner, @note, @sort, @active)
     ON CONFLICT(id) DO UPDATE SET name=@name, subject=@subject, color=@color, books_json=@books, landing_path=@landingPath,
       share_pct=@sharePct, slot_ids_json=@slotIds, needs_owner=@needsOwner, note=@note, sort=@sort, active=@active`,
  ).run({ ...p, books: JSON.stringify(p.books), slotIds: JSON.stringify(p.slotIds), needsOwner: p.needsOwner ? 1 : 0, active: p.active ? 1 : 0 });
  return p;
}

export function saveSlot(input: Partial<Slot> & { id: string }): Slot {
  if (!ID_RE.test(input.id)) throw new Error("Slot id: letters, digits and dashes only");
  const cur = listSlots().find((s) => s.id === input.id);
  const s: Slot = {
    id: input.id,
    label: input.label ?? cur?.label ?? input.id,
    timeFrom: input.timeFrom ?? cur?.timeFrom ?? "12:00",
    timeTo: input.timeTo ?? cur?.timeTo ?? "13:00",
    kind: isPostKind(input.kind) ? input.kind : (cur?.kind ?? "image"),
    note: input.note ?? cur?.note ?? "",
    sort: input.sort ?? cur?.sort ?? 99,
    active: input.active ?? cur?.active ?? true,
  };
  const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!TIME.test(s.timeFrom) || !TIME.test(s.timeTo)) throw new Error("Slot times must be HH:MM");
  db.prepare(
    `INSERT INTO planner_slots (id, label, time_from, time_to, kind, note, sort, active)
     VALUES (@id, @label, @timeFrom, @timeTo, @kind, @note, @sort, @active)
     ON CONFLICT(id) DO UPDATE SET label=@label, time_from=@timeFrom, time_to=@timeTo, kind=@kind, note=@note, sort=@sort, active=@active`,
  ).run({ ...s, active: s.active ? 1 : 0 });
  return s;
}

// --- Posts ---

export function listPosts(from: string, to: string): PlannerPost[] {
  return (db.prepare("SELECT * FROM planner_posts WHERE date >= ? AND date <= ? ORDER BY date, slot_id").all(from, to) as PostRow[]).map(toPost);
}

export function listReserve(): PlannerPost[] {
  return (db.prepare("SELECT * FROM planner_posts WHERE reserve = 1 AND date IS NULL ORDER BY created_at").all() as PostRow[]).map(toPost);
}

export function getPost(id: string): PlannerPost | null {
  const r = db.prepare("SELECT * FROM planner_posts WHERE id = ?").get(id) as PostRow | undefined;
  return r ? toPost(r) : null;
}

export type PostInput = Partial<Omit<PlannerPost, "id" | "createdAt" | "updatedAt" | "autoApproved" | "review">>;

function validate(p: PlannerPost): void {
  if (p.reserve) {
    if (p.date !== null || p.slotId !== null) throw new Error("A reserve post has no day or slot");
  } else {
    if (!isDate(p.date)) throw new Error("Date must be YYYY-MM-DD");
    if (!p.slotId || !listSlots().some((s) => s.id === p.slotId)) throw new Error(`Unknown slot "${p.slotId}"`);
  }
  if (p.pillarId && !listPillars().some((x) => x.id === p.pillarId)) throw new Error(`Unknown pillar "${p.pillarId}"`);
  if (NEEDS_MEDIA.includes(p.status) && !p.mediaPath.trim()) throw new Error(`A ${p.status} post needs its media file`);
  const lines = p.source.lines;
  if (lines !== undefined && (!Array.isArray(lines) || lines.some((l) => !l || typeof l.id !== "string" || typeof l.text !== "string")))
    throw new Error("source.lines must be a list of { id, text }");
}

function logEvent(postId: string, from: PostStatus | null, to: PostStatus, reason: string, by: string): void {
  db.prepare("INSERT INTO planner_post_events (id, post_id, from_status, to_status, reason, by, at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    randomUUID(), postId, from, to, reason, by, new Date().toISOString(),
  );
}

function write(p: PlannerPost): void {
  db.prepare(
    `INSERT INTO planner_posts (id, date, slot_id, reserve, pillar_id, book, kind, title, hook, caption, photo, media_path, source_json,
       status, status_reason, auto_approved, notes, remote_id, created_at, updated_at)
     VALUES (@id, @date, @slotId, @reserve, @pillarId, @book, @kind, @title, @hook, @caption, @photo, @mediaPath, @source,
       @status, @statusReason, @autoApproved, @notes, @remoteId, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET date=@date, slot_id=@slotId, reserve=@reserve, pillar_id=@pillarId, book=@book, kind=@kind,
       title=@title, hook=@hook, caption=@caption, photo=@photo, media_path=@mediaPath, source_json=@source, status=@status,
       status_reason=@statusReason, auto_approved=@autoApproved, notes=@notes, remote_id=@remoteId, updated_at=@updatedAt`,
  ).run({ ...p, reserve: p.reserve ? 1 : 0, autoApproved: p.autoApproved ? 1 : 0, source: JSON.stringify(p.source) });
}

export function createPost(input: PostInput, by = "owner"): PlannerPost {
  const now = new Date().toISOString();
  const reserve = input.reserve ?? false;
  const slot = listSlots().find((s) => s.id === input.slotId);
  const p: PlannerPost = {
    id: randomUUID(),
    date: reserve ? null : (input.date ?? null),
    slotId: reserve ? null : (input.slotId ?? null),
    reserve,
    pillarId: input.pillarId ?? null,
    book: input.book ?? "",
    kind: isPostKind(input.kind) ? input.kind : (slot?.kind ?? "image"),
    title: input.title ?? "",
    hook: input.hook ?? "",
    caption: input.caption ?? "",
    photo: input.photo ?? "",
    mediaPath: input.mediaPath ?? "",
    source: input.source ?? {},
    status: isPostStatus(input.status) ? input.status : "idea",
    statusReason: input.statusReason ?? "",
    autoApproved: false,
    notes: input.notes ?? "",
    remoteId: input.remoteId ?? null,
    review: null,
    createdAt: now,
    updatedAt: now,
  };
  validate(p);
  guardRepeats(p);
  write(p);
  logEvent(p.id, null, p.status, p.statusReason, by);
  return p;
}

export function updatePost(id: string, input: PostInput, by = "owner"): PlannerPost {
  const cur = getPost(id);
  if (!cur) throw new Error("Post not found");
  const reserve = input.reserve ?? cur.reserve;
  const next: PlannerPost = {
    ...cur,
    ...Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)),
    id: cur.id,
    reserve,
    date: reserve ? null : (input.date !== undefined ? input.date : cur.date),
    slotId: reserve ? null : (input.slotId !== undefined ? input.slotId : cur.slotId),
    kind: isPostKind(input.kind) ? input.kind : cur.kind,
    status: isPostStatus(input.status) ? input.status : cur.status,
    createdAt: cur.createdAt,
    updatedAt: new Date().toISOString(),
  };
  // An owner edit of an auto-approved post makes it the owner's post.
  if (by === "owner" && next.status !== cur.status) next.autoApproved = false;
  validate(next);
  // Only re-check repeats when what is checked changed, so an old post can still be edited.
  const lineKey = (x: PlannerPost) => sourceTexts(x).join("\n");
  if (next.date !== cur.date || next.reserve !== cur.reserve || next.photo !== cur.photo || lineKey(next) !== lineKey(cur) || (cur.status === "rejected" && next.status !== "rejected"))
    guardRepeats(next);
  write(next);
  if (next.status !== cur.status) logEvent(id, cur.status, next.status, next.statusReason, by);
  return next;
}

// --- Repeat guard (docs/16 §3, §4) ---

/** A book line is not used again within this many days (before or after). */
export const LINE_REPEAT_DAYS = 90;
/** A background photo is not used again within this many days. */
export const PHOTO_REPEAT_DAYS = 30;

/** Case, spacing and punctuation don't make a line new. */
export const normLine = (s: string): string => s.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();

const sourceTexts = (p: Pick<PlannerPost, "source">): string[] => (p.source.lines ?? []).map((l) => normLine(l.text)).filter(Boolean);

export interface Repeat {
  kind: "line" | "photo";
  /** The repeated line text or photo path. */
  value: string;
  postId: string;
  date: string | null;
  slotId: string | null;
  title: string;
}

/**
 * Other posts that already use these lines / this photo inside the window.
 * Rejected posts don't count; reserve posts always count (they will go out
 * some day). A reserve post is checked as if it went out today.
 */
export function findRepeats(
  p: { id?: string; date: string | null; source: PostSource; photo?: string },
  today = todaySriLanka(),
): Repeat[] {
  const at = p.date ?? today;
  const texts = new Set(sourceTexts(p));
  const photo = (p.photo ?? "").trim();
  if (texts.size === 0 && !photo) return [];
  const rows = db
    .prepare("SELECT * FROM planner_posts WHERE id != ? AND status != 'rejected' AND (date IS NULL OR (date >= ? AND date <= ?))")
    .all(p.id ?? "", addDays(at, -LINE_REPEAT_DAYS), addDays(at, LINE_REPEAT_DAYS)) as PostRow[];
  const photoFrom = addDays(at, -PHOTO_REPEAT_DAYS);
  const photoTo = addDays(at, PHOTO_REPEAT_DAYS);
  const out: Repeat[] = [];
  for (const o of rows.map(toPost)) {
    const where = { postId: o.id, date: o.date, slotId: o.slotId, title: o.title };
    for (const l of o.source.lines ?? []) if (texts.has(normLine(l.text))) out.push({ kind: "line", value: l.text, ...where });
    if (photo && o.photo.trim() === photo && (o.date === null || (o.date >= photoFrom && o.date <= photoTo)))
      out.push({ kind: "photo", value: photo, ...where });
  }
  return out;
}

const describeRepeat = (r: Repeat): string =>
  `${r.kind === "line" ? `"${r.value.length > 60 ? `${r.value.slice(0, 57)}...` : r.value}"` : `Photo ${r.value}`} is already in ${
    r.date ? `the ${r.date} ${r.slotId ?? ""} post` : "a reserve post"
  }${r.title ? ` ("${r.title}")` : ""}`;

function guardRepeats(p: PlannerPost): void {
  if (p.status === "rejected") return;
  const reps = findRepeats(p);
  if (reps.length === 0) return;
  const more = reps.length > 3 ? ` (+${reps.length - 3} more)` : "";
  throw new Error(
    `Repeat: ${reps.slice(0, 3).map(describeRepeat).join("; ")}${more}. Lines wait ${LINE_REPEAT_DAYS} days, photos ${PHOTO_REPEAT_DAYS} days.`,
  );
}

/** A unit's lines, each with the post that already uses it in the window (if any). */
export function unitLinesWithUse(book: string, unit: string, date: string | null, excludePostId = ""): (SourceLine & { usedBy: Repeat | null })[] {
  const lines = unitLines(book, unit);
  const reps = findRepeats({ id: excludePostId, date, source: { lines: lines.map((l) => ({ id: l.id, text: l.text })) } });
  const byText = new Map(reps.map((r) => [normLine(r.value), r]));
  return lines.map((l) => ({ ...l, usedBy: byText.get(normLine(l.text)) ?? null }));
}

export interface SourcePick {
  book: string;
  unit: string;
  unitTitle: string;
  free: boolean;
  lines: SourceLine[];
}

/**
 * "Pick for me": `count` unused lines from one unit of the book. Free units
 * first (people can open them before buying), then the rest in random order.
 * `kind` keeps only one kind of line (e.g. "mistake" for a grammar post).
 */
export function suggestSource(
  book: string,
  date: string | null,
  count: number,
  opts: { excludePostId?: string; kind?: SourceLineKind; random?: () => number } = {},
): SourcePick | null {
  const { excludePostId = "", kind, random = Math.random } = opts;
  const units = bookOutline(book).groups.flatMap((g) => g.units);
  const shuffled = units.map((u) => ({ u, r: random() })).sort((a, b) => Number(b.u.free) - Number(a.u.free) || a.r - b.r).map((x) => x.u);
  const n = Math.max(1, Math.min(50, Math.floor(count)));
  for (const u of shuffled) {
    if (u.count !== null && u.count < n) continue;
    const unused = unitLinesWithUse(book, u.id, date, excludePostId).filter((l) => !l.usedBy && (!kind || l.kind === kind));
    if (unused.length < n) continue;
    const lines = unused.slice(0, n).map(({ usedBy: _u, ...l }) => l);
    return { book, unit: u.id, unitTitle: u.title, free: u.free, lines };
  }
  return null;
}

/**
 * Stores a review (P4). When it approves, a `drafted` post becomes `approved`
 * with the auto flag; otherwise it stays `drafted` and the reasons go into
 * statusReason, so it shows under "needs you".
 */
export function saveReview(id: string, review: PostReview): PlannerPost {
  const cur = getPost(id);
  if (!cur) throw new Error("Post not found");
  db.prepare("UPDATE planner_posts SET review_json = ? WHERE id = ?").run(JSON.stringify(review), id);
  if (cur.status !== "drafted") return getPost(id)!;
  if (review.approved) {
    const next = updatePost(id, { status: "approved", statusReason: "" }, "auto");
    db.prepare("UPDATE planner_posts SET auto_approved = 1 WHERE id = ?").run(id);
    return { ...next, autoApproved: true };
  }
  const failed = review.checks.filter((c) => !c.ok).map((c) => c.label + (c.detail ? ` (${c.detail})` : ""));
  const reasons = [...review.needsOwner.map((n) => `Needs you: ${n}`), ...failed];
  return updatePost(id, { statusReason: reasons.join("; ").slice(0, 1000) }, "auto");
}

/**
 * Rejects a post with a reason (kept for next week's drafts) and, when the
 * reserve has a ready post, moves it into the same day and slot (docs/16 §10.1).
 */
export function rejectAndRefill(id: string, reason: string): { rejected: PlannerPost; filled: PlannerPost | null } {
  const cur = getPost(id);
  if (!cur) throw new Error("Post not found");
  if (!reason.trim()) throw new Error("Say why it is rejected: Claude reads the reason next week");
  const rejected = updatePost(id, { status: "rejected", statusReason: reason.trim() });
  let filled: PlannerPost | null = null;
  if (cur.date && cur.slotId && STOCK_STATUSES.includes(cur.status)) {
    for (const r of listReserve().filter((x) => STOCK_STATUSES.includes(x.status))) {
      try {
        filled = fillFromReserve(r.id, cur.date, cur.slotId);
        break;
      } catch {
        // that reserve post repeats a line or photo near this day: try the next one
      }
    }
  }
  return { rejected, filled };
}

/** The latest rejection reasons, for the writer prompt ("the rules get tighter over time"). */
export function recentRejections(limit = 30): { title: string; book: string; reason: string; at: string }[] {
  return db
    .prepare(
      `SELECT p.title AS title, p.book AS book, e.reason AS reason, e.at AS at FROM planner_post_events e
       JOIN planner_posts p ON p.id = e.post_id WHERE e.to_status = 'rejected' AND e.reason != '' ORDER BY e.at DESC LIMIT ?`,
    )
    .all(limit) as { title: string; book: string; reason: string; at: string }[];
}

export function deletePost(id: string): void {
  // Deleting forgets the post completely (rejecting is how a reason is kept).
  db.prepare("DELETE FROM planner_post_events WHERE post_id = ?").run(id);
  db.prepare("DELETE FROM planner_posts WHERE id = ?").run(id);
}

/** Moves a reserve post into an empty day + slot (docs/16 §7: "fill from reserve"). */
export function fillFromReserve(postId: string, date: string, slotId: string): PlannerPost {
  const post = getPost(postId);
  if (!post?.reserve) throw new Error("Not a reserve post");
  return updatePost(postId, { reserve: false, date, slotId });
}

// --- Stock (buffer) ---

export interface StockLevel {
  today: string;
  /** Consecutive days from today on which every active slot has a stock post. */
  fullDays: number;
  /** Consecutive days from today with at least one stock post (the streak is safe). */
  streakDays: number;
  /** Stock posts from today on, any day. */
  stockPosts: number;
  reservePosts: number;
  targetDays: number;
  level: "ok" | "warning" | "red";
  /** Posts that need the owner (drafted, failed) from today on. */
  needsYou: number;
}

export const STOCK_TARGET_DAYS = 14;
const WARNING_DAYS = 7;
const RED_DAYS = 3;
const LOOKAHEAD_DAYS = 60;

export function stockLevel(today = todaySriLanka()): StockLevel {
  const slots = listSlots().filter((s) => s.active);
  const posts = listPosts(today, addDays(today, LOOKAHEAD_DAYS));
  const stock = posts.filter((p) => STOCK_STATUSES.includes(p.status));
  const byDay = new Map<string, Set<string>>();
  for (const p of stock) {
    if (!p.date || !p.slotId) continue;
    if (!byDay.has(p.date)) byDay.set(p.date, new Set());
    byDay.get(p.date)!.add(p.slotId);
  }
  let fullDays = 0;
  while (fullDays <= LOOKAHEAD_DAYS && slots.length > 0 && slots.every((s) => byDay.get(addDays(today, fullDays))?.has(s.id))) fullDays++;
  let streakDays = 0;
  while (streakDays <= LOOKAHEAD_DAYS && (byDay.get(addDays(today, streakDays))?.size ?? 0) > 0) streakDays++;
  const reservePosts = listReserve().filter((p) => STOCK_STATUSES.includes(p.status)).length;
  return {
    today,
    fullDays,
    streakDays,
    stockPosts: stock.length,
    reservePosts,
    targetDays: STOCK_TARGET_DAYS,
    level: fullDays < RED_DAYS ? "red" : fullDays < WARNING_DAYS ? "warning" : "ok",
    needsYou: posts.filter((p) => p.status === "drafted" || p.status === "failed").length,
  };
}

/** Share of each pillar among the posts in [from, to], vs its target. */
export function pillarMix(from: string, to: string): { pillarId: string; posts: number; pct: number; targetPct: number }[] {
  const posts = listPosts(from, to).filter((p) => p.status !== "rejected");
  const total = posts.length || 1;
  return listPillars()
    .filter((p) => p.active)
    .map((pl) => {
      const n = posts.filter((p) => p.pillarId === pl.id).length;
      return { pillarId: pl.id, posts: n, pct: Math.round((n / total) * 100), targetPct: pl.sharePct };
    });
}
