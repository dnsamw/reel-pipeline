import { randomUUID } from "node:crypto";
import { claude } from "./ai/cli";
import { db } from "./db";
import { listCatalogBooks, unitLines, type CatalogBook, type SourceLineKind } from "./lmsCatalog";
import {
  addDays,
  createPost,
  deletePost,
  fillEmptySlots,
  getPost,
  listReserve,
  listPillars,
  listPosts,
  listSlots,
  recentRejections,
  suggestSource,
  todaySriLanka,
  updatePost,
  type Pillar,
  type PlannerPost,
  type PostKind,
  type Slot,
} from "./planner";
import { ADULT_BOOK, checkPost, composeCaption, expectedSales, reviewPosts } from "./planReview";
import { bestPlannerPosts, feedbackReport, learningNotes, weightMap, type FeedbackReport } from "./planLearn";
import { resolveMedia } from "./weekPack";
import { pickPhoto } from "./photoPicker";
import { renderBlocker, renderPlannerPost } from "./planRender";
import { latestScoutNotes, runScout } from "./scout";

/**
 * The weekly batch (studypal-lms docs/16 §2): plan empty slots by the pillar
 * mix, pick book lines and a stock photo, have Claude write hook + caption
 * (no prices or links: the code adds the sales block), then review: code
 * checks + Claude critic → approved on its own, or "needs you".
 */

export const WRITE_CHUNK = 6;
export const REVIEW_CHUNK = 6;

// --- 1. Plan: which pillar, book and lines go in each empty slot ---

export interface PlannedSlot {
  /** null for a reserve post (no day or slot until it fills a gap). */
  date: string | null;
  slot: Slot | null;
  kind: PostKind;
  pillar: Pillar;
  reserve?: boolean;
}

/** docs/16 §7: the evergreen reserve holds 10 posts. */
export const RESERVE_TARGET = 10;

const isFilled = (p: PlannerPost) => p.status !== "rejected";

/**
 * Empty active slots in [from, to] (not before today), each with the pillar
 * that is furthest behind its share. `weights` (P5, from the numbers) scales
 * each pillar's share; missing = 1.
 */
export function planSlots(from: string, to: string, today = todaySriLanka(), weights: Map<string, number> = new Map()): PlannedSlot[] {
  const slots = listSlots().filter((s) => s.active);
  const pillars = listPillars().filter((p) => p.active && p.sharePct > 0);
  const posts = listPosts(from, to).filter(isFilled);
  const taken = new Set(posts.map((p) => `${p.date}|${p.slotId}`));
  const count = new Map<string, number>();
  for (const p of posts) if (p.pillarId) count.set(p.pillarId, (count.get(p.pillarId) ?? 0) + 1);
  let total = posts.length;
  const out: PlannedSlot[] = [];
  const share = (p: Pillar) => p.sharePct * (weights.get(p.id) ?? 1);
  const shareSum = pillars.reduce((n, p) => n + share(p), 0) || 1;

  for (let d = from < today ? today : from; d <= to; d = addDays(d, 1)) {
    const dayPillars = new Set(posts.filter((p) => p.date === d).map((p) => p.pillarId));
    for (const slot of slots) {
      if (taken.has(`${d}|${slot.id}`)) continue;
      const fits = pillars.filter((p) => p.slotIds.length === 0 || p.slotIds.includes(slot.id));
      if (fits.length === 0) continue;
      const deficit = (p: Pillar) => ((total + 1) * share(p)) / shareSum - (count.get(p.id) ?? 0);
      const best = [...fits].sort((a, b) => Number(dayPillars.has(a.id)) - Number(dayPillars.has(b.id)) || deficit(b) - deficit(a) || a.sort - b.sort)[0];
      out.push({ date: d, slot, kind: slot.kind, pillar: best });
      count.set(best.id, (count.get(best.id) ?? 0) + 1);
      dayPillars.add(best.id);
      total++;
    }
  }
  return out;
}

/** The pillar's books (or every book of its subject), least used in the last 30 days first. Never the 18+ book. */
function booksFor(pillar: Pillar, date: string): CatalogBook[] {
  const all = listCatalogBooks();
  const pool = (pillar.books.length ? all.filter((b) => pillar.books.includes(b.slug)) : all.filter((b) => b.subject === pillar.subject)).filter(
    (b) => b.slug !== ADULT_BOOK,
  );
  const used = new Map<string, number>();
  for (const p of listPosts(addDays(date, -30), addDays(date, 14))) if (p.book) used.set(p.book, (used.get(p.book) ?? 0) + 1);
  return pool.map((b) => ({ b, n: used.get(b.slug) ?? 0, r: Math.random() })).sort((x, y) => x.n - y.n || x.r - y.r).map((x) => x.b);
}

const linesFor = (pillar: Pillar, kind: string): { count: number; kind?: SourceLineKind } =>
  pillar.subject === "grammar" ? { count: 3, kind: "mistake" } : kind === "reel" ? { count: 3 } : { count: 5 };

/** Creates `idea` posts for the planned slots and reserve posts (book lines + photo picked; the repeat guard runs on each). */
function createIdeas(plan: PlannedSlot[], log: (l: string) => void): PlannerPost[] {
  const made: PlannerPost[] = [];
  const photos: string[] = [];
  const today = todaySriLanka();
  for (const ps of plan) {
    const kind = ps.kind;
    const where = ps.reserve ? "the reserve" : `${ps.date} ${ps.slot?.id}`;
    const base = ps.reserve
      ? { reserve: true, pillarId: ps.pillar.id, kind, status: "idea" as const }
      : { date: ps.date, slotId: ps.slot?.id ?? null, pillarId: ps.pillar.id, kind, status: "idea" as const };
    if (ps.pillar.subject === "brand") {
      made.push(createPost({ ...base, title: `${ps.pillar.name} (needs you)` }, "claude"));
      continue;
    }
    const day = ps.date ?? today;
    let post: PlannerPost | null = null;
    for (const book of booksFor(ps.pillar, day)) {
      const want = linesFor(ps.pillar, kind);
      const pick = suggestSource(book.slug, ps.date, want.count, { kind: want.kind });
      if (!pick) continue;
      const photo = kind === "image" || kind === "carousel" ? (pickPhoto(ps.pillar.subject, book.slug, day, { exclude: photos }) ?? "") : "";
      if (photo) photos.push(photo);
      try {
        post = createPost(
          {
            ...base,
            book: book.slug,
            title: pick.unitTitle,
            photo,
            source: { book: pick.book, unit: pick.unit, unitTitle: pick.unitTitle, free: pick.free, lines: pick.lines.map((l) => ({ id: l.id, text: l.text })) },
          },
          "claude",
        );
        break;
      } catch (err) {
        log(`skip ${book.slug} for ${where}: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
      }
    }
    if (post) made.push(post);
    else log(`no unused lines left for ${ps.pillar.name} (${where})`);
  }
  return made;
}

// --- 1b. The evergreen reserve (docs/16 §7, P5) ---

/** Reserve posts that are ready or on their way (idea, drafted, approved, rendered). */
const reserveCount = () => listReserve().filter((p) => p.status !== "rejected" && p.status !== "failed").length;

/** How many reserve posts the batch should add to reach RESERVE_TARGET. */
export const reserveGap = () => Math.max(0, RESERVE_TARGET - reserveCount());

/**
 * Plans `n` reserve posts: timeless posts from the pillars that can go out
 * without the owner (no brand or launch posts), by the same weighted shares
 * as the calendar. Half reels, half image posts, like the slots.
 */
export function planReserve(n: number, weights: Map<string, number> = new Map()): PlannedSlot[] {
  if (n <= 0) return [];
  const slots = listSlots().filter((s) => s.active);
  const pillars = listPillars().filter((p) => p.active && p.sharePct > 0 && !p.needsOwner && p.subject !== "brand");
  const existing = listReserve().filter((p) => p.status !== "rejected");
  const kinds = [...new Set(slots.map((s) => s.kind))];
  if (kinds.length === 0 || pillars.length === 0) return [];
  const kindCount = new Map(kinds.map((k) => [k, existing.filter((p) => p.kind === k).length]));
  const count = new Map<string, number>();
  for (const p of existing) if (p.pillarId) count.set(p.pillarId, (count.get(p.pillarId) ?? 0) + 1);
  const share = (p: Pillar) => p.sharePct * (weights.get(p.id) ?? 1);
  const out: PlannedSlot[] = [];
  let total = existing.length;
  for (let i = 0; i < n; i++) {
    const kind = [...kinds].sort((a, b) => (kindCount.get(a) ?? 0) - (kindCount.get(b) ?? 0))[0];
    // A pillar fits this type when it may use a slot of that type.
    const fits = pillars.filter((p) => p.slotIds.length === 0 || slots.some((s) => s.kind === kind && p.slotIds.includes(s.id)));
    if (fits.length === 0) break;
    const sum = fits.reduce((x, p) => x + share(p), 0) || 1;
    const deficit = (p: Pillar) => ((total + 1) * share(p)) / sum - (count.get(p.id) ?? 0);
    const best = [...fits].sort((a, b) => deficit(b) - deficit(a) || a.sort - b.sort)[0];
    out.push({ date: null, slot: null, kind, pillar: best, reserve: true });
    kindCount.set(kind, (kindCount.get(kind) ?? 0) + 1);
    count.set(best.id, (count.get(best.id) ?? 0) + 1);
    total++;
  }
  return out;
}

/**
 * docs/16 §7 "best past performers": copies of the Planner's best measured
 * posts (top quarter of their type) go back into the reserve, with the same
 * media and caption. The repeat guard decides when: a copy is only made once
 * its lines and photo are out of their windows (90 / 30 days). The copy goes
 * through the code checks again (prices may have changed); it is ready on its
 * own when they pass, else it waits for the owner as a draft.
 */
export function cloneBestPosts(max: number, log: (l: string) => void = () => {}): PlannerPost[] {
  const made: PlannerPost[] = [];
  if (max <= 0) return made;
  const copied = new Set(listReserve().map((p) => p.notes.match(/repeat-of:(\S+)/)?.[1]).filter(Boolean));
  for (const best of bestPlannerPosts()) {
    if (made.length >= max) break;
    if (copied.has(best.postId)) continue;
    const src = getPost(best.postId);
    if (!src || !src.caption.trim() || !resolveMedia(src.mediaPath)) continue;
    let copy: PlannerPost;
    try {
      copy = createPost(
        {
          reserve: true,
          pillarId: src.pillarId,
          book: src.book,
          kind: src.kind,
          title: src.title,
          hook: src.hook,
          caption: src.caption,
          photo: src.photo,
          source: src.source,
          status: "drafted",
          notes: `Repeat of the ${src.date} post (score ${best.score}) repeat-of:${src.id}`,
        },
        "auto",
      );
    } catch {
      continue; // still inside a repeat window
    }
    const { checks, needsOwner } = checkPost(copy.id);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length === 0 && needsOwner.length === 0) copy = updatePost(copy.id, { mediaPath: src.mediaPath, status: "rendered", statusReason: "Best past post, back in the reserve" }, "auto");
    else copy = updatePost(copy.id, { statusReason: [...needsOwner.map((n) => `Needs you: ${n}`), ...failed.map((c) => c.label + (c.detail ? ` (${c.detail})` : ""))].join("; ") }, "auto");
    log(`reserve: copy of the ${src.date} post (score ${best.score}) → ${copy.status}`);
    made.push(copy);
  }
  return made;
}

// --- 2. Write: Claude writes hook + caption body + hashtags ---

const WRITE_SCHEMA = {
  type: "object",
  properties: {
    posts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          hook: { type: "string" },
          body: { type: "string" },
          hashtags: { type: "array", items: { type: "string" }, maxItems: 5 },
          notes: { type: "string" },
        },
        required: ["key", "title", "hook", "body", "hashtags", "notes"],
      },
    },
  },
  required: ["posts"],
};

const WRITER_RULES = [
  "You write Facebook posts for StudyPal's Page. StudyPal sells books (and a learning app, app.studypal.store) that teach English, Japanese and Korean to Sinhala speakers in Sri Lanka. Many readers want to work abroad (Korea, Japan, Israel, the Middle East).",
  "For each post you get: the pillar (what it's about), the book, the post type, the slot, and the book lines to use. Write:",
  "- hook: the text that goes ON the image or reel cover, in natural Sinhala (English words where Sri Lankans really use them), at most 12 words. Specific and curious, not generic.",
  "- body: the caption without any sales line. Sinhala first. The first two lines must hook the reader. Then use the given book lines: quote each line EXACTLY as given (same spelling and punctuation), with its Sinhala meaning, numbered or as a short list. For a reel, the caption supports the video (the lines are in the video); keep it short. For an image post you can explain a little more.",
  "- hashtags: 3-5 relevant hashtags (e.g. #StudyPal #LearnEnglish #EnglishWithSinhala, #KoreanWithSinhala, #JapaneseWithSinhala, #EPS_TOPIK).",
  "- title: a short English title for the planner list.",
  "- notes: one short English line for the owner (what angle you took).",
  "Hard rules:",
  "- Never write prices, phone numbers or links: the code adds the sales block after your text.",
  "- Never invent example lines, translations, numbers, results, reviews, testimonials or people. Use only the given lines and facts.",
  "- Pronunciation and meaning come from the book: when you show how a line sounds, copy sinhalaPronunciation exactly as given; when you give its meaning, use the given meaning. Never write your own romanisation or translation of a book line.",
  "- A hook that asks a question must be answered in the caption with one of the given lines.",
  "- Never say how long app access lasts, never say 'lifetime' or 'forever'. '3 devices' is fine.",
  "- No like/comment/share bait, no 'tag a friend', no promises of jobs, visas or passing exams.",
  "- Nothing sexual or rude. Polite, warm, confident; like a helpful older sibling, not an advert.",
  "- Each phrase book is sold on its own: name the book you are given, not '10 books'.",
  "- Don't repeat hooks that were used recently (listed below). Vary the angle across the posts in this batch.",
].join("\n");

interface Written {
  key: string;
  title: string;
  hook: string;
  body: string;
  hashtags: string[];
  notes: string;
}

function writerContext(learned = ""): string {
  const parts: string[] = [];
  if (learned) parts.push(learned);
  const rej = recentRejections(20);
  if (rej.length) parts.push(`The owner rejected these recent posts; don't make the same mistakes:\n${rej.map((r) => `- ${r.title || r.book}: ${r.reason}`).join("\n")}`);
  const recent = listPosts(addDays(todaySriLanka(), -21), addDays(todaySriLanka(), 21))
    .map((p) => p.hook)
    .filter(Boolean)
    .slice(-40);
  if (recent.length) parts.push(`Hooks already used (don't repeat them):\n${recent.map((h) => `- ${h}`).join("\n")}`);
  const notes = latestScoutNotes();
  if (notes.length)
    parts.push(
      `Scout notes from Grok (this week's trends and dates; use an item only when it fits a post naturally, never invent facts from it):\n${notes.map((n) => `## ${n.topic} (${n.at.slice(0, 10)})\n${n.text.slice(0, 2500)}`).join("\n\n")}`,
    );
  return parts.join("\n\n");
}

async function writePosts(posts: PlannerPost[], log: (l: string) => void, learned = ""): Promise<string[]> {
  const pillars = new Map(listPillars().map((p) => [p.id, p]));
  const slots = new Map(listSlots().map((s) => [s.id, s]));
  const books = new Map(listCatalogBooks().map((b) => [b.slug, b]));
  const context = writerContext(learned);
  const drafted: string[] = [];
  for (let i = 0; i < posts.length; i += WRITE_CHUNK) {
    const part = posts.slice(i, i + WRITE_CHUNK);
    const items = part.map((p) => {
      const pillar = pillars.get(p.pillarId ?? "");
      const slot = slots.get(p.slotId ?? "");
      const book = books.get(p.book);
      const all = p.book && p.source.unit ? unitLines(p.book, p.source.unit) : [];
      return {
        key: p.id,
        day: p.reserve ? "reserve: no fixed day" : p.date,
        slot: p.reserve
          ? "Evergreen reserve post: it fills a gap on any day, so keep it timeless (no dates, days, seasons or 'this week')"
          : slot
            ? `${slot.label} ${slot.timeFrom}-${slot.timeTo} (${slot.note})`
            : p.slotId,
        type: p.kind,
        pillar: pillar ? `${pillar.name}: ${pillar.note}` : "",
        book: book ? { title: book.title, titleSi: book.titleSi } : "(StudyPal app / brand post: no book lines; write about the app in general terms only)",
        section: p.source.unitTitle ?? "",
        freeToTry: !!p.source.free,
        lines: (p.source.lines ?? []).map((l) => {
          const full = all.find((x) => x.id === l.id);
          return { text: l.text, sinhalaPronunciation: full?.say ?? "", meaning: full?.meaning ?? "", note: full?.note ?? "", wrong: full?.wrong };
        }),
      };
    });
    log(`Claude writing ${i + 1}-${i + part.length} of ${posts.length}…`);
    try {
      const r = await claude<{ posts: Written[] }>(
        `${context ? `${context}\n\n---\n\n` : ""}Write these ${items.length} posts. Return one entry per key.\n\n${JSON.stringify(items, null, 1)}`,
        { label: "planner: write", system: WRITER_RULES, schema: WRITE_SCHEMA },
      );
      const byKey = new Map((r.structured?.posts ?? []).map((w) => [w.key, w]));
      for (const p of part) {
        const w = byKey.get(p.id);
        if (!w || !w.body.trim()) {
          log(`no draft came back for ${p.date} ${p.slotId}`);
          continue;
        }
        const caption = composeCaption({ body: w.body, sales: expectedSales(p), hashtags: w.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)) });
        updatePost(p.id, { title: w.title || p.title, hook: w.hook.trim(), caption, notes: w.notes, status: "drafted", statusReason: "" }, "claude");
        drafted.push(p.id);
      }
    } catch (err) {
      log(`writing failed: ${(err instanceof Error ? err.message : String(err)).slice(0, 300)}`);
    }
  }
  return drafted;
}

// --- 3. The batch job ---

export interface BatchEstimate {
  from: string;
  to: string;
  slots: number;
  /** New reserve posts Claude writes to bring the reserve to RESERVE_TARGET. */
  reserve: number;
  /** Reserve posts now (ready or on their way). */
  reserveNow: number;
  /** Pillars whose share the numbers moved (P5). */
  weights: { name: string; weight: number }[];
  claudeCalls: number;
  grokCalls: number;
  byPillar: Record<string, number>;
}

export function estimateBatch(from: string, to: string, scout: boolean, withReserve = true): BatchEstimate {
  const report = feedbackReport();
  const weights = weightMap(report);
  const plan = planSlots(from, to, undefined, weights);
  const reserve = withReserve ? planReserve(reserveGap(), weights).length : 0;
  const byPillar: Record<string, number> = {};
  for (const p of plan) byPillar[p.pillar.name] = (byPillar[p.pillar.name] ?? 0) + 1;
  const n = plan.length + reserve;
  return {
    from,
    to,
    slots: plan.length,
    reserve,
    reserveNow: RESERVE_TARGET - reserveGap(),
    weights: report.weights.filter((w) => w.weight !== 1).map((w) => ({ name: w.name, weight: w.weight })),
    claudeCalls: Math.ceil(n / WRITE_CHUNK) + Math.ceil(n / REVIEW_CHUNK),
    grokCalls: scout ? 3 : 0,
    byPillar,
  };
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
  /** Reserve posts added (new ones Claude wrote + copies of best posts). */
  reserveAdded: number;
  /** Empty slots filled from the reserve at the end. */
  filledFromReserve: number;
  error: string | null;
}

let current: BatchJob | null = null;

export const batchJob = (): BatchJob | null => current;

/** Starts the batch in the background (one at a time). `limit` caps how many slots are filled. */
export function startBatch(from: string, to: string, opts: { scout?: boolean; limit?: number; reserve?: boolean } = {}): BatchJob {
  if (current?.state === "running") throw new Error("A batch is already running");
  const job: BatchJob = {
    id: randomUUID(),
    from,
    to,
    state: "running",
    startedAt: new Date().toISOString(),
    finishedAt: null,
    log: [],
    created: 0,
    drafted: 0,
    approved: 0,
    needsYou: 0,
    rendered: 0,
    reserveAdded: 0,
    filledFromReserve: 0,
    error: null,
  };
  current = job;
  const log = (l: string) => {
    job.log.push(`${new Date().toISOString().slice(11, 19)} ${l}`);
    if (job.log.length > 400) job.log.shift();
  };
  void (async () => {
    try {
      if (opts.scout) await runScout(undefined, log);
      // P5: the Page's numbers move pillar shares a little and tell the writer what worked.
      const report = feedbackReport();
      const weights = weightMap(report);
      const learned = learningNotes(report);
      log(`numbers: ${report.samples} Facebook posts ${report.from}..${report.to}${weights.size ? `, shares moved: ${report.weights.filter((w) => w.weight !== 1).map((w) => `${w.name} ×${w.weight}`).join(", ")}` : ""}`);
      let plan = planSlots(from, to, undefined, weights);
      if (opts.limit !== undefined) plan = plan.slice(0, Math.max(0, opts.limit));
      log(`${plan.length} empty slots to fill`);
      if (opts.reserve !== false) {
        const copies = cloneBestPosts(reserveGap(), log);
        const extra = planReserve(opts.limit !== undefined ? Math.min(reserveGap(), Math.max(0, opts.limit - plan.length)) : reserveGap(), weights);
        job.reserveAdded = copies.length + extra.length;
        if (extra.length) log(`${extra.length} new reserve posts to write (reserve target ${RESERVE_TARGET})`);
        plan = [...plan, ...extra];
      }
      const ideas = createIdeas(plan, log);
      job.created = ideas.length;
      const drafted = await writePosts(ideas, log, learned);
      job.drafted = drafted.length;
      // Ideas Claude didn't write stay as ideas, so the owner sees the gap; nothing is half-written.
      log(`reviewing ${drafted.length} drafts…`);
      const r = await reviewPosts(drafted, log, REVIEW_CHUNK);
      job.approved = r.approved;
      job.needsYou = r.needsYou;
      // Approved posts are rendered right away: image posts with the Hook photo template, reels silent with music.
      for (const id of drafted) {
        const p = getPost(id);
        if (!p || p.status !== "approved" || renderBlocker(p)) continue;
        try {
          await renderPlannerPost(id, "auto", log);
          job.rendered++;
          log(`rendered ${p.date} ${p.slotId}`);
        } catch (err) {
          log(`render failed ${p.date} ${p.slotId}: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`);
        }
      }
      // Slots still empty (no lines left, a failed write was cleaned up…) take a ready reserve post.
      const filled = fillEmptySlots(from, to);
      job.filledFromReserve = filled.length;
      if (filled.length) log(`${filled.length} empty slots filled from the reserve`);
      job.state = "done";
      log(`done: ${r.approved} approved on their own (${job.rendered} rendered), ${r.needsYou} need you`);
    } catch (err) {
      job.state = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      log(`failed: ${job.error}`);
    } finally {
      job.finishedAt = new Date().toISOString();
    }
  })();
  return job;
}

/** Removes `idea` posts the batch created but couldn't write (owner's "clean up" button). */
export function dropUnwrittenIdeas(from: string, to: string): number {
  const rows = db
    .prepare("SELECT p.id FROM planner_posts p WHERE p.status = 'idea' AND p.caption = '' AND p.date >= ? AND p.date <= ? AND EXISTS (SELECT 1 FROM planner_post_events e WHERE e.post_id = p.id AND e.by = 'claude')")
    .all(from, to) as { id: string }[];
  for (const r of rows) if (getPost(r.id)) deletePost(r.id);
  return rows.length;
}
