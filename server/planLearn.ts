import { listPlatformPosts } from "./analytics/store";
import { db } from "./db";
import { bannedReason } from "./planReview";
import { addDays, listPillars, listSlots, todaySriLanka, type Pillar, type Slot } from "./planner";

/**
 * P5, the feedback loop (studypal-lms docs/16 §2 step 1): the Page's numbers
 * shape the next plan. Everything here is code, no AI call:
 *
 * - each Facebook post gets a score 0-100: its rank among posts of the same
 *   type (reels vs image posts) in the window, by views (or reach, or
 *   likes + comments + shares when views aren't there). 50 = a typical post.
 * - posts are grouped by slot, 2-hour time band, pillar, hook style and book.
 *   Posts made outside the Planner count for time bands and hook styles
 *   (their first caption line is the hook); pillars and books only come
 *   from Planner posts.
 * - a group says something only with MIN_POSTS posts or more.
 *
 * What it changes: pillar shares move by at most ±25 % (pillarWeights), the
 * writer gets "what worked" notes, the owner gets slot suggestions (slots are
 * never moved by code).
 */

export const MIN_POSTS = 5;
/** Numbers are read once a post is this old (earlier counts are still climbing). */
export const SETTLE_DAYS = 3;
export const DEFAULT_WINDOW_DAYS = 56;
const MAX_WEIGHT_CHANGE = 0.25;

export const HOOK_STYLES = ["warning", "mistake", "number", "question", "how-to-say", "statement"] as const;
export type HookStyle = (typeof HOOK_STYLES)[number];

export const HOOK_STYLE_LABELS: Record<HookStyle, string> = {
  warning: "Warning / 🚨",
  mistake: "Mistake / wrong vs right",
  number: "Number (\"5 phrases…\")",
  question: "Question",
  "how-to-say": "How do you say / what does it mean",
  statement: "Plain statement",
};

/** The hook's style, by simple rules (first match wins). */
export function hookStyle(hook: string): HookStyle {
  const h = hook.trim();
  if (/🚨|🛑|⚠️|දැනගැනීමට පමණයි|\bwarning\b/i.test(h)) return "warning";
  if (/වැරදි|වරද|❌|\bmistakes?\b|\bwrong\b|\bdon'?t say\b/i.test(h)) return "mistake";
  if (/\d/.test(h)) return "number";
  if (/කොහොමද|කොහොම ද|කියන්නේ|කියන්න|තේරුම|\bhow to say\b|\bmeaning\b|\bmeans\b/i.test(h)) return "how-to-say";
  if (/[?？]/.test(h)) return "question";
  return "statement";
}

export type SampleKind = "reel" | "image";
export type ScoreBy = "views" | "reach" | "engagement";

export interface Sample {
  remoteId: string;
  permalink: string | null;
  at: string;
  /** Sri Lanka day and minutes after midnight. */
  day: string;
  minutes: number;
  kind: SampleKind;
  hook: string;
  style: HookStyle;
  views: number | null;
  reach: number | null;
  engagement: number | null;
  /** Rank among the same kind in the window, 0-100 (50 = typical). */
  score: number;
  /** The metric value the score is ranked by. */
  value: number;
  planner: { postId: string; pillarId: string | null; slotId: string | null; book: string } | null;
}

export interface Group {
  key: string;
  label: string;
  kind?: SampleKind;
  n: number;
  /** Median score (50 = typical). */
  score: number;
  /** Median of the ranked metric (views / reach / engagement). */
  value: number;
  /** n ≥ MIN_POSTS. */
  signal: boolean;
}

export interface SlotSuggestion {
  slotId: string;
  text: string;
}

export interface FeedbackReport {
  from: string;
  to: string;
  days: number;
  samples: number;
  plannerSamples: number;
  scoreBy: Record<SampleKind, ScoreBy | null>;
  bySlot: Group[];
  byBand: Group[];
  byPillar: Group[];
  byStyle: Group[];
  byBook: Group[];
  top: Sample[];
  bottom: Sample[];
  weights: { pillarId: string; name: string; sharePct: number; weight: number; effectivePct: number; n: number }[];
  suggestions: SlotSuggestion[];
}

const KIND_OF: Record<string, SampleKind | undefined> = { reel: "reel", video: "reel", photo: "image", carousel: "image" };

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

function sriLankaTime(iso: string): { day: string; minutes: number } {
  const d = new Date(iso);
  const day = todaySriLanka(d);
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { day, minutes: minutesOf(t) };
}

const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** First caption line with letters in it, cut to 120 chars. */
export function firstLine(text: string | null | undefined): string {
  const line = (text ?? "").split(/\r?\n/).map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) ?? "";
  return line.slice(0, 120);
}

interface PlannerLink {
  id: string;
  pillar_id: string | null;
  slot_id: string | null;
  book: string;
  hook: string;
  remote_id: string;
}

/** Facebook posts in [from, to] (Sri Lanka days) with numbers, scored within their kind. */
export function collectSamples(from: string, to: string): { samples: Sample[]; scoreBy: Record<SampleKind, ScoreBy | null> } {
  const links = new Map(
    (db.prepare("SELECT id, pillar_id, slot_id, book, hook, remote_id FROM planner_posts WHERE remote_id IS NOT NULL").all() as PlannerLink[]).map((r) => [r.remote_id, r]),
  );
  const raw: Omit<Sample, "score" | "value">[] = [];
  for (const p of listPlatformPosts()) {
    if (p.platform !== "facebook") continue;
    const kind = KIND_OF[p.kind];
    if (!kind) continue;
    const { day, minutes } = sriLankaTime(p.createdAt);
    if (day < from || day > to) continue;
    const m = p.metrics;
    const eng = [m.likes, m.comments, m.shares].some((v) => v != null) ? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) : null;
    if (m.views == null && m.reach == null && eng == null) continue;
    const link = links.get(p.remoteId);
    const hook = (link?.hook || "").trim() || firstLine(p.caption ?? p.title);
    raw.push({
      remoteId: p.remoteId,
      permalink: p.permalink,
      at: p.createdAt,
      day,
      minutes,
      kind,
      hook,
      style: hookStyle(hook),
      views: m.views,
      reach: m.reach,
      engagement: eng,
      planner: link ? { postId: link.id, pillarId: link.pillar_id, slotId: link.slot_id, book: link.book } : null,
    });
  }

  const scoreBy: Record<SampleKind, ScoreBy | null> = { reel: null, image: null };
  const samples: Sample[] = [];
  for (const kind of ["reel", "image"] as SampleKind[]) {
    const ofKind = raw.filter((s) => s.kind === kind);
    // The first metric most posts of this kind have (photos usually have no views).
    const by = (["views", "reach", "engagement"] as ScoreBy[]).find((k) => ofKind.filter((s) => s[k] != null).length >= Math.max(1, ofKind.length * 0.6)) ?? null;
    scoreBy[kind] = by;
    if (!by) continue;
    const ranked = ofKind.filter((s) => s[by] != null).sort((a, b) => a[by]! - b[by]!);
    ranked.forEach((s, i) => {
      // Ties share their average rank; one post alone is "typical".
      const v = s[by]!;
      const first = ranked.findIndex((x) => x[by] === v);
      let last = first;
      while (last + 1 < ranked.length && ranked[last + 1][by] === v) last++;
      const rank = (first + last) / 2;
      const score = ranked.length === 1 ? 50 : Math.round((rank / (ranked.length - 1)) * 100);
      samples.push({ ...s, score, value: v });
    });
  }
  return { samples, scoreBy };
}

function group(samples: Sample[], keyOf: (s: Sample) => string | null, labelOf: (key: string) => string, kindOf?: (key: string) => SampleKind | undefined): Group[] {
  const by = new Map<string, Sample[]>();
  for (const s of samples) {
    const k = keyOf(s);
    if (!k) continue;
    if (!by.has(k)) by.set(k, []);
    by.get(k)!.push(s);
  }
  return [...by.entries()]
    .map(([key, xs]) => ({
      key,
      label: labelOf(key),
      kind: kindOf?.(key),
      n: xs.length,
      score: Math.round(median(xs.map((x) => x.score))),
      value: Math.round(median(xs.map((x) => x.value))),
      signal: xs.length >= MIN_POSTS,
    }))
    .sort((a, b) => Number(b.signal) - Number(a.signal) || b.score - a.score);
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 2-hour band, e.g. "reel|16" = reels posted 16:00-17:59. */
const bandKey = (s: Sample) => `${s.kind}|${pad(Math.floor(s.minutes / 120) * 2)}`;
const bandLabel = (key: string) => {
  const [kind, h] = key.split("|");
  return `${kind === "reel" ? "Reels" : "Image posts"} ${h}:00-${pad(Number(h) + 2)}:00`;
};

/** The slot a post went out in: its Planner slot, or the active slot of its kind whose window holds its time. */
function slotOf(s: Sample, slots: Slot[]): string | null {
  if (s.planner?.slotId) return s.planner.slotId;
  const hit = slots.find((sl) => (KIND_OF[sl.kind] ?? sl.kind) === s.kind && s.minutes >= minutesOf(sl.timeFrom) && s.minutes < minutesOf(sl.timeTo));
  return hit?.id ?? null;
}

/**
 * Pillar shares adjusted by numbers: a pillar with MIN_POSTS Planner posts
 * or more moves by (score - 50) %, at most ±25 %. The owner's share stays the
 * base; a pillar at 0 % stays at 0.
 */
export function pillarWeights(byPillar: Group[], pillars: Pillar[]): FeedbackReport["weights"] {
  const g = new Map(byPillar.map((x) => [x.key, x]));
  const rows = pillars
    .filter((p) => p.active && p.sharePct > 0)
    .map((p) => {
      const x = g.get(p.id);
      const weight = x?.signal ? Math.min(1 + MAX_WEIGHT_CHANGE, Math.max(1 - MAX_WEIGHT_CHANGE, 1 + (x.score - 50) / 100)) : 1;
      return { pillarId: p.id, name: p.name, sharePct: p.sharePct, weight: Math.round(weight * 100) / 100, n: x?.n ?? 0, effectivePct: 0 };
    });
  const sum = rows.reduce((n, r) => n + r.sharePct * r.weight, 0) || 1;
  const base = rows.reduce((n, r) => n + r.sharePct, 0);
  for (const r of rows) r.effectivePct = Math.round(((r.sharePct * r.weight) / sum) * base * 10) / 10;
  return rows;
}

/**
 * "Reels at 16:00-18:00 did 3× better than R2's 18:00-19:00": for each active
 * slot, a band of the same kind with MIN_POSTS posts whose median is at least
 * 1.5× the slot's own band. Text for the owner; code never moves a slot.
 */
export function slotSuggestions(byBand: Group[], slots: Slot[]): SlotSuggestion[] {
  const out: SlotSuggestion[] = [];
  const bands = new Map(byBand.map((b) => [b.key, b]));
  for (const sl of slots.filter((s) => s.active)) {
    const kind = (KIND_OF[sl.kind] ?? sl.kind) as SampleKind;
    const own = bands.get(`${kind}|${pad(Math.floor(minutesOf(sl.timeFrom) / 120) * 2)}`);
    if (!own?.signal || own.value <= 0) continue;
    const best = byBand.filter((b) => b.kind === kind && b.signal && b.key !== own.key).sort((a, b) => b.value - a.value)[0];
    if (!best || best.value < own.value * 1.5) continue;
    const times = (best.value / own.value).toFixed(1);
    out.push({
      slotId: sl.id,
      text: `${sl.label} (${sl.id}, ${sl.timeFrom}-${sl.timeTo}): ${best.label.toLowerCase()} got ${times}× the median of ${own.label.toLowerCase()} (${best.n} vs ${own.n} posts). Worth trying that time for a few weeks.`,
    });
  }
  return out;
}

export function feedbackReport(days = DEFAULT_WINDOW_DAYS, today = todaySriLanka()): FeedbackReport {
  const to = addDays(today, -SETTLE_DAYS);
  const from = addDays(to, -(days - 1));
  const { samples, scoreBy } = collectSamples(from, to);
  const slots = listSlots();
  const pillars = listPillars();
  const slotName = new Map(slots.map((s) => [s.id, `${s.label} (${s.id} ${s.timeFrom}-${s.timeTo})`]));
  const pillarName = new Map(pillars.map((p) => [p.id, p.name]));
  const planned = samples.filter((s) => s.planner);

  const slotKind = new Map(slots.map((sl) => [sl.id, (KIND_OF[sl.kind] ?? sl.kind) as SampleKind]));
  const bySlot = group(samples, (s) => slotOf(s, slots), (k) => slotName.get(k) ?? k, (k) => slotKind.get(k));
  const byBand = group(samples, bandKey, bandLabel, (k) => k.split("|")[0] as SampleKind);
  const byPillar = group(planned, (s) => s.planner!.pillarId, (k) => pillarName.get(k) ?? k);
  const byStyle = group(samples, (s) => s.style, (k) => HOOK_STYLE_LABELS[k as HookStyle] ?? k);
  const byBook = group(planned, (s) => s.planner!.book || null, (k) => k);
  // Examples for the writer: one per hook text, none that breaks a rule (bait, rude words).
  const seen = new Set<string>();
  const sorted = [...samples]
    .sort((a, b) => b.score - a.score || b.value - a.value)
    .filter((s) => s.hook && !bannedReason(s.hook))
    .filter((s) => {
      const k = s.hook.replace(/\s+/g, " ").toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return {
    from,
    to,
    days,
    samples: samples.length,
    plannerSamples: planned.length,
    scoreBy,
    bySlot,
    byBand,
    byPillar,
    byStyle,
    byBook,
    top: sorted.slice(0, 5),
    bottom: sorted.length > 10 ? sorted.slice(-5).reverse() : [],
    weights: pillarWeights(byPillar, pillars),
    suggestions: slotSuggestions(byBand, slots),
  };
}

/** Pillar id → weight for planSlots (only pillars that moved). */
export function weightMap(r: FeedbackReport): Map<string, number> {
  return new Map(r.weights.filter((w) => w.weight !== 1).map((w) => [w.pillarId, w.weight]));
}

/**
 * The part of the writer prompt that comes from the numbers: hook styles
 * that did better or worse, the best and weakest hooks. Hints, never hooks
 * to copy.
 */
export function learningNotes(r: FeedbackReport): string {
  if (r.samples < MIN_POSTS) return "";
  const lines: string[] = [];
  lines.push(`What the Page's numbers say (Facebook, ${r.from} to ${r.to}, ${r.samples} posts; score 50 = a typical post of its type):`);
  const styles = r.byStyle.filter((g) => g.signal);
  if (styles.length) lines.push(`Hook styles: ${styles.map((g) => `${g.label} ${g.score} (${g.n} posts)`).join("; ")}.`);
  const pillars = r.byPillar.filter((g) => g.signal);
  if (pillars.length) lines.push(`Pillars: ${pillars.map((g) => `${g.label} ${g.score} (${g.n})`).join("; ")}.`);
  if (r.top.length) lines.push(`Best hooks (learn the angle, don't copy them):\n${r.top.map((s) => `- [${s.kind}, score ${s.score}] ${s.hook}`).join("\n")}`);
  if (r.bottom.length) lines.push(`Weakest hooks (avoid these angles):\n${r.bottom.slice(0, 3).map((s) => `- [${s.kind}, score ${s.score}] ${s.hook}`).join("\n")}`);
  lines.push("Lean towards the styles that scored above 50, but keep every rule above; numbers never beat a rule.");
  return lines.join("\n");
}

/**
 * Planner posts in the top quarter of their kind over the last `days` days
 * (docs/16 §7: "best past performers" go back into the reserve), best first.
 */
export function bestPlannerPosts(days = 180, minScore = 75, today = todaySriLanka()): { postId: string; score: number }[] {
  const to = addDays(today, -SETTLE_DAYS);
  return collectSamples(addDays(to, -(days - 1)), to)
    .samples.filter((s) => s.planner && s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .map((s) => ({ postId: s.planner!.postId, score: s.score }));
}
