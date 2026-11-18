import { claude } from "./ai/cli";
import { listCatalogBooks, unitLines } from "./lmsCatalog";
import { findRepeats, getPost, listPillars, listSlots, normLine, saveReview, type PlannerPost, type PostReview } from "./planner";
import { stockPhotoPath } from "./photoPicker";
import { APP_HOST, knownPriceStrings, salesBlock } from "./salesBlock";

/**
 * Auto-approval (studypal-lms docs/16 §10.1): a drafted post becomes
 * approved on its own only when every code check passes, the Claude critic
 * (a separate call from the writer) scores ≥ 4 on every score, and nothing
 * on the "always needs you" list applies.
 */

/** The 18+ phrase book never leads a post and is never auto-approved. */
export const ADULT_BOOK = "real-talk";

// --- Caption parts: body (Claude) + sales block (code) + hashtags ---

export interface CaptionParts {
  body: string;
  sales: string[];
  hashtags: string[];
}

export function composeCaption(p: CaptionParts): string {
  const tags = p.hashtags.length ? `\n\n${p.hashtags.join(" ")}` : "";
  return `${p.body.trim()}\n\n${p.sales.join("\n")}${tags}`;
}

export function expectedSales(post: Pick<PlannerPost, "book" | "pillarId" | "kind" | "source">): string[] {
  const pillar = listPillars().find((x) => x.id === post.pillarId);
  const book = listCatalogBooks().find((b) => b.slug === post.book) ?? null;
  return salesBlock({
    book,
    subject: pillar?.subject ?? book?.subject ?? "brand",
    kind: post.kind,
    landingPath: pillar?.landingPath ?? "/",
    freeUnit: post.source.free && post.source.unit ? post.source.unit : null,
  });
}

// --- Banned words (code check; a gap found in a rejection becomes a new line here) ---

const BANNED: { re: RegExp; why: string }[] = [
  { re: /\b(fuck|shit|bitch|bastard|dick|pussy|sex|sexy|porn|nude|horny)\w*/i, why: "profanity or sexual word" },
  { re: /\blifetime\b|ජීවිත\s*කාලය(ටම)?|සදහටම|සදාකාලික/i, why: "no lifetime claims (app access has an end date)" },
  {
    // \b only works next to Latin letters, so the Sinhala verbs are matched without it.
    re: /\b(like|comment|share|tag)\s*(එකක්\s*)?(කරන්න|කරලා|කරපු|දාන්න|දාලා)|\b(like|comment|share)\s+(if|and|&|\+)\s+(share|comment|you|tag)\b|\bcomment\s+(below|your)\b|\btag\s+(a\s+)?friend/i,
    why: "no like/comment/share bait",
  },
  { re: /\b(guarantee[ds]?|100%\s*(job|pass|success))\b|සහතිකයි|අනිවාර්යයෙන්ම\s*(රැකියාව|pass)/i, why: "no guaranteed results" },
];

/**
 * "Never print how long app access lasts": a time span (a number with a
 * day/month/year word, either order, as Sinhala puts the unit first) within
 * 40 characters of an access word.
 */
const ACCESS_WORD = /access|ප්‍රවේශ|ඇක්සස්|ඇප්\s*එක|app/gi;
const SPAN = /\d+\s*\S{0,3}\s*(days?|weeks?|months?|years?|දින|දවස්|සති|මාස|අවුරුදු)|(days?|weeks?|months?|years?|දින|දවස්|සති|මාස|අවුරුදු)\s*\d+/i;
export function mentionsAccessLength(text: string): boolean {
  for (const m of text.matchAll(ACCESS_WORD)) {
    const near = text.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 40);
    if (SPAN.test(near)) return true;
  }
  return false;
}

const PRICE_RE = /(?:රු\.?|Rs\.?|LKR)\s*[\d,]+/gi;

const sinhalaWords = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function codeChecks(post: PlannerPost): { checks: PostReview["checks"]; needsOwner: string[] } {
  const checks: PostReview["checks"] = [];
  const needsOwner: string[] = [];
  const add = (id: string, label: string, ok: boolean, detail?: string) => checks.push({ id, label, ok, ...(detail ? { detail } : {}) });
  const pillar = listPillars().find((x) => x.id === post.pillarId);
  const slot = listSlots().find((s) => s.id === post.slotId);

  // Lines from the export
  if (post.book) {
    const lines = post.source.lines ?? [];
    let ok = lines.length > 0 && !!post.source.unit;
    let detail = ok ? undefined : "no book lines picked";
    if (ok) {
      try {
        const real = new Set(unitLines(post.book, post.source.unit!).map((l) => normLine(l.text)));
        const missing = lines.filter((l) => !real.has(normLine(l.text)));
        ok = missing.length === 0;
        if (!ok) detail = `not in the export: "${missing[0].text.slice(0, 40)}"`;
      } catch (err) {
        ok = false;
        detail = err instanceof Error ? err.message : String(err);
      }
    }
    add("source", "Lines come from the book export", ok, detail);
    // The lines are quoted exactly in the caption (no invented example lines).
    const cap = normLine(post.caption);
    const quoted = lines.filter((l) => cap.includes(normLine(l.text)));
    add("quoted", "Book lines quoted exactly", lines.length === 0 || quoted.length > 0, quoted.length === 0 && lines.length ? "none of the picked lines is in the caption" : undefined);
  }

  // Sales block from the code, prices only there
  const sales = expectedSales(post);
  const at = post.caption.indexOf(sales.join("\n"));
  add("sales", "Sales block from products.ts (≤ 2 lines)", at >= 0 && sales.length <= 2, at < 0 ? "caption doesn't carry the code's sales block" : undefined);
  const body = at >= 0 ? post.caption.slice(0, at) : post.caption;
  const known = knownPriceStrings();
  const typed = [...body.matchAll(PRICE_RE)].map((m) => m[0]);
  add("prices", "No typed prices or links", typed.length === 0 && !body.includes(APP_HOST), typed.length ? `price in the text: ${typed[0]}` : body.includes(APP_HOST) ? "link typed in the text" : undefined);
  const salesPrices = [...sales.join(" ").matchAll(PRICE_RE)].map((m) => m[0].replace(/^Rs\.?|LKR/i, "රු.").trim());
  if (salesPrices.some((p) => !known.has(p))) add("price-known", "Prices match products.ts", false, salesPrices.find((p) => !known.has(p)));

  // Banned words
  const text = `${post.hook}\n${post.caption}`;
  const hit = BANNED.find((b) => b.re.test(text))?.why ?? (mentionsAccessLength(body) ? "never print how long app access lasts" : undefined);
  add("banned", "No banned words or bait", !hit, hit);

  // Hook
  const words = sinhalaWords(post.hook);
  add("hook", "Hook ≤ 12 words", words > 0 && words <= 12, words === 0 ? "no hook" : words > 12 ? `${words} words` : undefined);
  const firstLines = post.caption.split("\n").filter((l) => l.trim()).slice(0, 2).join(" ");
  add("hook-first", "Hook in the first two lines", firstLines.length >= 10);

  // Repeats (lines 90 days, photo 30 days)
  const reps = findRepeats(post);
  add("repeat", "No line or photo repeated in its window", reps.length === 0, reps[0] ? `${reps[0].kind} used ${reps[0].date ?? "in reserve"}` : undefined);

  // Photo from stock-images
  if (post.kind === "image" || post.kind === "carousel") {
    if (!post.photo) add("photo", "Background photo from stock-images/", false, "no photo yet: download photos for this book");
    else add("photo", "Background photo from stock-images/", !!stockPhotoPath(post.photo), stockPhotoPath(post.photo) ? undefined : `not found: ${post.photo}`);
  }
  if (post.photo.split("/").pop()?.startsWith("ai-grok-")) needsOwner.push("AI-generated background (Grok)");

  // Slot, pillar
  const slotOk = !!slot && (!pillar || pillar.slotIds.length === 0 || pillar.slotIds.includes(slot.id));
  add("slot", "Slot fits the pillar", slotOk, slotOk ? undefined : `${pillar?.name} is planned for ${pillar?.slotIds.join("/")}`);
  if (slot && slot.kind !== post.kind) add("kind", "Post type fits the slot", false, `${post.kind} in a ${slot.kind} slot`);

  if (!pillar) needsOwner.push("no pillar");
  else if (pillar.needsOwner) needsOwner.push(`${pillar.name} posts always need you`);
  if (post.book === ADULT_BOOK) needsOwner.push("the 18+ book");
  return { checks, needsOwner };
}

// --- Claude critic ---

interface CriticReview {
  key: string;
  hook: number;
  sinhala: number;
  accuracy: number;
  rules: number;
  claims: boolean;
  notes: string;
}

const CRITIC_SCHEMA = {
  type: "object",
  properties: {
    reviews: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          hook: { type: "integer", minimum: 1, maximum: 5 },
          sinhala: { type: "integer", minimum: 1, maximum: 5 },
          accuracy: { type: "integer", minimum: 1, maximum: 5 },
          rules: { type: "integer", minimum: 1, maximum: 5 },
          claims: { type: "boolean" },
          notes: { type: "string" },
        },
        required: ["key", "hook", "sinhala", "accuracy", "rules", "claims", "notes"],
      },
    },
  },
  required: ["reviews"],
};

const CRITIC_SYSTEM = [
  "You are a strict editor for StudyPal's Facebook Page. StudyPal sells books that teach English, Japanese and Korean to Sinhala speakers in Sri Lanka, with a learning app.",
  "You review posts written by another writer. Score each 1-5 (5 = ready to post as is, 4 = good, 3 = needs a fix, 1-2 = wrong):",
  "- hook: do the hook and the first two lines make a Sri Lankan Facebook user stop scrolling? Specific beats generic.",
  "- sinhala: is the Sinhala natural, everyday spoken Sinhala a Sri Lankan would write (English words in Sinhala text are fine where people really use them)? Any machine-translated feel, wrong word or odd grammar is ≤ 3.",
  "- accuracy: are the book lines quoted exactly as given, and are the meanings and explanations right? Each book line comes with the book's own Sinhala pronunciation, meaning, note and (for grammar mistakes) the wrong sentence: those are from the book and may be used. Any invented example line, a meaning or pronunciation that differs from the book's, or a wrong explanation is ≤ 2.",
  "- rules: no prices or links in the body (the code adds them), no like/comment/share bait, no promise of results, no lifetime or access-length claims, nothing sexual, polite.",
  "claims = true when the post claims something not in the given book lines or facts: results ('you will get the job'), numbers, testimonials, reviews, people presented as real users.",
  "notes: one or two short English sentences: what to fix, or what is good. Be concrete.",
].join("\n");

async function critic(posts: PlannerPost[]): Promise<Map<string, CriticReview>> {
  const books = new Map(listCatalogBooks().map((b) => [b.slug, b]));
  const items = posts.map((p) => {
    let full: ReturnType<typeof unitLines> = [];
    try {
      full = p.book && p.source.unit ? unitLines(p.book, p.source.unit) : [];
    } catch {
      // a missing unit shows up in the code checks
    }
    return {
      key: p.id,
      pillar: listPillars().find((x) => x.id === p.pillarId)?.name ?? "",
      book: books.get(p.book)?.title ?? (p.book || "(app / brand post)"),
      type: p.kind,
      hookOnImage: p.hook,
      caption: p.caption,
      // Everything the book gives for each line: the writer may use any of it, nothing else.
      bookLines: (p.source.lines ?? []).map((l) => {
        const f = full.find((x) => x.id === l.id);
        return { text: l.text, sinhalaPronunciation: f?.say ?? "", meaning: f?.meaning ?? "", note: f?.note ?? "", ...(f?.wrong ? { wrongSentenceFromTheBook: f.wrong } : {}) };
      }),
    };
  });
  const r = await claude<{ reviews: CriticReview[] }>(
    `Review these ${items.length} posts. Return one review per key.\n\n${JSON.stringify(items, null, 1)}`,
    { label: "planner: critic", system: CRITIC_SYSTEM, schema: CRITIC_SCHEMA },
  );
  return new Map((r.structured?.reviews ?? []).map((x) => [x.key, x]));
}

/** Reviews drafted posts (code checks + one critic call per chunk) and approves the ones that pass. */
export async function reviewPosts(ids: string[], log: (line: string) => void = () => {}, chunk = 6): Promise<{ approved: number; needsYou: number }> {
  let approved = 0;
  let needsYou = 0;
  const posts = ids.map((id) => getPost(id)).filter((p): p is PlannerPost => !!p && p.status === "drafted");
  for (let i = 0; i < posts.length; i += chunk) {
    const part = posts.slice(i, i + chunk);
    let scores = new Map<string, CriticReview>();
    let criticError = "";
    try {
      scores = await critic(part);
    } catch (err) {
      criticError = err instanceof Error ? err.message : String(err);
      log(`critic failed: ${criticError.slice(0, 200)}`);
    }
    for (const p of part) {
      const { checks, needsOwner } = codeChecks(p);
      const c = scores.get(p.id);
      if (c?.claims) needsOwner.push("makes a claim that isn't in the book");
      const low = c ? (["hook", "sinhala", "accuracy", "rules"] as const).filter((k) => c[k] < 4) : [];
      checks.push({
        id: "critic",
        label: "Claude critic ≥ 4 on every score",
        ok: !!c && low.length === 0,
        ...(c ? (low.length ? { detail: `low: ${low.map((k) => `${k} ${c[k]}`).join(", ")}` } : {}) : { detail: criticError ? "critic failed" : "no review" }),
      });
      const review: PostReview = {
        at: new Date().toISOString(),
        checks,
        scores: c ? { hook: c.hook, sinhala: c.sinhala, accuracy: c.accuracy, rules: c.rules } : null,
        criticNotes: c?.notes ?? criticError,
        needsOwner,
        approved: checks.every((x) => x.ok) && needsOwner.length === 0,
      };
      try {
        saveReview(p.id, review);
      } catch (err) {
        // Deleted or changed while the batch ran: skip it, don't fail the rest.
        log(`skipped ${p.date} ${p.slotId}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }
      if (review.approved) approved++;
      else needsYou++;
    }
    log(`reviewed ${Math.min(i + chunk, posts.length)}/${posts.length}`);
  }
  return { approved, needsYou };
}

/** Code checks only (no AI call), for the editor's "check now" and tests. */
export function checkPost(id: string): ReturnType<typeof codeChecks> {
  const p = getPost(id);
  if (!p) throw new Error("Post not found");
  return codeChecks(p);
}
