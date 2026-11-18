import { randomUUID } from "node:crypto";
import { claude } from "./ai/cli";
import { db } from "./db";
import { listCatalogBooks, unitLines, type CatalogBook, type SourceLineKind } from "./lmsCatalog";
import {
  addDays,
  createPost,
  deletePost,
  getPost,
  listPillars,
  listPosts,
  listSlots,
  recentRejections,
  suggestSource,
  todaySriLanka,
  updatePost,
  type Pillar,
  type PlannerPost,
  type Slot,
} from "./planner";
import { ADULT_BOOK, composeCaption, expectedSales, reviewPosts } from "./planReview";
import { pickPhoto } from "./photoPicker";
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
  date: string;
  slot: Slot;
  pillar: Pillar;
}

const isFilled = (p: PlannerPost) => p.status !== "rejected";

/** Empty active slots in [from, to] (not before today), each with the pillar that is furthest behind its share. */
export function planSlots(from: string, to: string, today = todaySriLanka()): PlannedSlot[] {
  const slots = listSlots().filter((s) => s.active);
  const pillars = listPillars().filter((p) => p.active && p.sharePct > 0);
  const posts = listPosts(from, to).filter(isFilled);
  const taken = new Set(posts.map((p) => `${p.date}|${p.slotId}`));
  const count = new Map<string, number>();
  for (const p of posts) if (p.pillarId) count.set(p.pillarId, (count.get(p.pillarId) ?? 0) + 1);
  let total = posts.length;
  const out: PlannedSlot[] = [];
  const shareSum = pillars.reduce((n, p) => n + p.sharePct, 0) || 1;

  for (let d = from < today ? today : from; d <= to; d = addDays(d, 1)) {
    const dayPillars = new Set(posts.filter((p) => p.date === d).map((p) => p.pillarId));
    for (const slot of slots) {
      if (taken.has(`${d}|${slot.id}`)) continue;
      const fits = pillars.filter((p) => p.slotIds.length === 0 || p.slotIds.includes(slot.id));
      if (fits.length === 0) continue;
      const deficit = (p: Pillar) => ((total + 1) * p.sharePct) / shareSum - (count.get(p.id) ?? 0);
      const best = [...fits].sort((a, b) => Number(dayPillars.has(a.id)) - Number(dayPillars.has(b.id)) || deficit(b) - deficit(a) || a.sort - b.sort)[0];
      out.push({ date: d, slot, pillar: best });
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

/** Creates `idea` posts for the planned slots (book lines + photo picked; the repeat guard runs on each). */
function createIdeas(plan: PlannedSlot[], log: (l: string) => void): PlannerPost[] {
  const made: PlannerPost[] = [];
  const photos: string[] = [];
  for (const ps of plan) {
    const kind = ps.slot.kind;
    const base = { date: ps.date, slotId: ps.slot.id, pillarId: ps.pillar.id, kind, status: "idea" as const };
    if (ps.pillar.subject === "brand") {
      made.push(createPost({ ...base, title: `${ps.pillar.name} (needs you)` }, "claude"));
      continue;
    }
    let post: PlannerPost | null = null;
    for (const book of booksFor(ps.pillar, ps.date)) {
      const want = linesFor(ps.pillar, kind);
      const pick = suggestSource(book.slug, ps.date, want.count, { kind: want.kind });
      if (!pick) continue;
      const photo = kind === "image" || kind === "carousel" ? (pickPhoto(ps.pillar.subject, book.slug, ps.date, { exclude: photos }) ?? "") : "";
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
        log(`skip ${book.slug} for ${ps.date} ${ps.slot.id}: ${(err instanceof Error ? err.message : String(err)).slice(0, 120)}`);
      }
    }
    if (post) made.push(post);
    else log(`no unused lines left for ${ps.pillar.name} on ${ps.date} ${ps.slot.id}`);
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

function writerContext(): string {
  const parts: string[] = [];
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

async function writePosts(posts: PlannerPost[], log: (l: string) => void): Promise<string[]> {
  const pillars = new Map(listPillars().map((p) => [p.id, p]));
  const slots = new Map(listSlots().map((s) => [s.id, s]));
  const books = new Map(listCatalogBooks().map((b) => [b.slug, b]));
  const context = writerContext();
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
        day: p.date,
        slot: slot ? `${slot.label} ${slot.timeFrom}-${slot.timeTo} (${slot.note})` : p.slotId,
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
  claudeCalls: number;
  grokCalls: number;
  byPillar: Record<string, number>;
}

export function estimateBatch(from: string, to: string, scout: boolean): BatchEstimate {
  const plan = planSlots(from, to);
  const byPillar: Record<string, number> = {};
  for (const p of plan) byPillar[p.pillar.name] = (byPillar[p.pillar.name] ?? 0) + 1;
  return {
    from,
    to,
    slots: plan.length,
    claudeCalls: Math.ceil(plan.length / WRITE_CHUNK) + Math.ceil(plan.length / REVIEW_CHUNK),
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
  error: string | null;
}

let current: BatchJob | null = null;

export const batchJob = (): BatchJob | null => current;

/** Starts the batch in the background (one at a time). `limit` caps how many slots are filled. */
export function startBatch(from: string, to: string, opts: { scout?: boolean; limit?: number } = {}): BatchJob {
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
      let plan = planSlots(from, to);
      if (opts.limit !== undefined) plan = plan.slice(0, Math.max(0, opts.limit));
      log(`${plan.length} empty slots to fill`);
      const ideas = createIdeas(plan, log);
      job.created = ideas.length;
      const drafted = await writePosts(ideas, log);
      job.drafted = drafted.length;
      // Ideas Claude didn't write stay as ideas, so the owner sees the gap; nothing is half-written.
      log(`reviewing ${drafted.length} drafts…`);
      const r = await reviewPosts(drafted, log, REVIEW_CHUNK);
      job.approved = r.approved;
      job.needsYou = r.needsYou;
      job.state = "done";
      log(`done: ${r.approved} approved on their own, ${r.needsYou} need you`);
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
