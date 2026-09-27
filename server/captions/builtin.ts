import type { CaptionContext, CaptionFormat, CaptionItem, CaptionOptions, CaptionPlatform, CaptionTone, PlatformCaption } from "../../src/captions/types";

/**
 * The built-in caption writer - no AI, no network, always available. A caption
 * is assembled from banks of hook lines, calls to action and hashtags, picked
 * deterministically from (seed, variant) so the same reel gets the same first
 * suggestion and "Shuffle" walks through the other combinations.
 *
 * Rules it keeps that matter for retention:
 * - never spoil the answer: a quiz reel lists only the English phrases, a
 *   reversed reel only the Sinhala meanings - the reveal stays in the video
 * - ask for a comment/save (engagement), then promote the book
 * - platform shape: Instagram links aren't clickable ("link in bio"), TikTok
 *   is short, YouTube gets a separate title plus #Shorts
 *
 * Edit the banks below to change the wording - every line is plain text.
 */

interface Fill {
  n: number;
  topic: string;
}

/** Hook lines: {n} = item count, {topic} = chapter/post title; `one`/`many` pick by count. Lines using {topic} are skipped when there's none. */
type Hook = string | { one: string; many: string };

const HOOKS: Record<CaptionFormat, Record<CaptionTone, Hook[]>> = {
  quiz: {
    friendly: [
      { one: "Do you know what this means in Sinhala? 🤔", many: "Do you know what these mean in Sinhala? 🤔" },
      { one: "Guess the Sinhala meaning before the reveal 👀", many: "How many of these can you guess before the reveal? 👀" },
      "Quick English check - {topic} edition ☕",
      { one: "You'll hear this every day. Do you know it?", many: "You'll hear these every day. Do you know them?" },
    ],
    challenge: [
      { one: "Only a few people get this right. Can you? 🔥", many: "Only a few people get all {n} right. Can you? 🔥" },
      "Beat the countdown ⏱️ Guess the meaning before it ends.",
      { one: "Bet you can't guess this one 😏", many: "Bet you can't get all {n} 😏" },
      "Pause, guess, then watch the answer. Ready? ⏸️",
    ],
    teacher: [
      { one: "An everyday English phrase you should know.", many: "{n} everyday English phrases you should know." },
      "Useful English for {topic}.",
      { one: "Learn what this really means - and how to say it.", many: "Learn what these really mean - and how to say them." },
      "Say it like a native speaker 🗣️",
    ],
  },
  reversed: {
    friendly: [
      { one: "Can you say this in English? 🤔", many: "Can you say these in English? 🤔" },
      { one: "You know it in Sinhala - but in English? 👀", many: "You know them in Sinhala - but in English? 👀" },
      "Quick English check - {topic} edition ☕",
      { one: "How would you say this in English?", many: "How would you say these in English?" },
    ],
    challenge: [
      { one: "Translate it before the timer ends ⏱️", many: "Translate them before the timer ends ⏱️" },
      { one: "Only a few people get this right in English 🔥", many: "Can you get all {n} right in English? 🔥" },
      { one: "Pause and say it out loud in English first ⏸️", many: "Pause and say each one out loud in English first ⏸️" },
      { one: "Bet you can't say this in English 😏", many: "Bet you can't say all {n} in English 😏" },
    ],
    teacher: [
      "From Sinhala to natural English.",
      "How to say it in English - {topic}.",
      "Stop translating word by word. Here's the natural English.",
      "Say it like a native speaker 🗣️",
    ],
  },
  list: {
    friendly: [
      "Save this for later 📌",
      { one: "An English phrase for {topic} ✨", many: "{n} English phrases for {topic} ✨" },
      { one: "One phrase, lots of use 💬", many: "{n} phrases you'll use again and again 💬" },
    ],
    challenge: [
      { one: "Did you know this one?", many: "How many of these did you already know? Be honest 😅" },
      { one: "Use this today 💪", many: "Use all {n} this week. Challenge accepted? 💪" },
      "Save it, practise it, own it 🔥",
    ],
    teacher: [
      { one: "An English phrase for {topic}.", many: "{n} English phrases for {topic}." },
      "Everyday English with Sinhala meanings.",
      "Learn these once, use them forever.",
    ],
  },
  quote: {
    friendly: ["Read this twice 💡", "A little reminder for your English journey ✨", "Save this for the days you feel stuck 📌"],
    challenge: ["Your English goal for this week 👇", "Agree? Tell us in the comments 👇", "Screenshot this and start today 🔥"],
    teacher: ["A tip for every English learner.", "Something worth remembering while you learn English.", "Keep this in mind while you practise."],
  },
};

const ENGAGE: Record<CaptionFormat, string[]> = {
  quiz: ["Drop your answer in the comments before the reveal 👇", "Pause and guess first ⏸️ Then comment how you did 👇", "Tag a friend who needs this 👀"],
  reversed: ["Comment your English answer before the reveal 👇", "Say it out loud first, then check ⏸️", "Tag a friend and see who gets it first 👀"],
  list: ["Save this post so you don't forget 📌", "Share it with a friend who's learning English 💬", "Which one will you use today? Tell us 👇"],
  quote: ["Save it for later 📌", "Share it with someone who needs this today 💬", "Agree? Tell us in the comments 👇"],
};

/** #LearnEnglish and #StudyPal are always included; these rotate. */
const HASHTAG_POOL = [
  "#EnglishPhrases",
  "#SpokenEnglish",
  "#Sinhala",
  "#SriLanka",
  "#EnglishVocabulary",
  "#SinhalaToEnglish",
  "#DailyEnglish",
  "#EnglishTips",
  "#EnglishLearning",
  "#LearnEnglishOnline",
];

const HASHTAG_COUNT: Record<CaptionPlatform, number> = { facebook: 3, instagram: 8, tiktok: 4, youtube: 3 };

/** Platform text limits (characters) - the caption is trimmed by dropping list items, never mid-word. */
const MAX_CHARS: Record<CaptionPlatform, number> = { facebook: 5000, instagram: 2200, tiktok: 2200, youtube: 5000 };
const MAX_ITEMS: Record<CaptionPlatform, number> = { facebook: 10, instagram: 10, tiktok: 3, youtube: 10 };
const YOUTUBE_TITLE_MAX = 100;

// --- helpers ---

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic pick: the same (seed, slot) always picks the same element. */
function pickIndex(length: number, seed: string, slot: string): number {
  return hash(`${seed}|${slot}`) % length;
}

function fillHook(hook: Hook, fill: Fill): string {
  const text = typeof hook === "string" ? hook : fill.n === 1 ? hook.one : hook.many;
  return text.replaceAll("{n}", String(fill.n)).replaceAll("{topic}", fill.topic);
}

function usesTopic(hook: Hook): boolean {
  return (typeof hook === "string" ? hook : hook.one + hook.many).includes("{topic}");
}

/** "At the Restaurant" -> "#AtTheRestaurant"; null when it'd be a poor hashtag (too long, no letters). */
function topicHashtag(topic: string): string | null {
  const words = topic.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 4) return null;
  const tag = words.map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  return tag.length >= 3 && tag.length <= 25 && /\p{L}/u.test(tag) ? `#${tag}` : null;
}

function webUrl(ctaUrl: string): string {
  return /^https?:\/\//.test(ctaUrl) ? ctaUrl : `https://${ctaUrl}`;
}

function bareUrl(ctaUrl: string): string {
  return ctaUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function cleanItems(items: CaptionItem[]): CaptionItem[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = it.english?.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One line per item, spoiler-free for quiz/reversed. */
function itemLine(item: CaptionItem, format: CaptionFormat): string | null {
  switch (format) {
    case "quiz":
      return `▶️ "${item.english}"`;
    case "reversed":
      return item.sinhala ? `▶️ ${item.sinhala}` : null;
    case "list": {
      const extra = [item.sinhala, item.pronunciation ? `(${item.pronunciation})` : null].filter(Boolean).join(" ");
      return `✅ ${item.english}${extra ? ` - ${extra}` : ""}`;
    }
    case "quote":
      return null;
  }
}

function promoLine(platform: CaptionPlatform, ctaUrl: string): string {
  switch (platform) {
    case "instagram":
      return `📘 Get the full Sinhala-to-English phrasebook - link in bio (${bareUrl(ctaUrl)})`;
    case "tiktok":
      return `📘 Full phrasebook: ${bareUrl(ctaUrl)}`;
    default:
      return `📘 Learn 200+ everyday English phrases with Sinhala meanings and pronunciation: ${webUrl(ctaUrl)}`;
  }
}

function youtubeTitle(ctx: CaptionContext, items: CaptionItem[]): string {
  const n = items.length;
  let title: string;
  if (ctx.format === "quiz") title = n === 1 ? `What does "${items[0].english}" mean in Sinhala?` : `Can you guess these ${n} English phrases in Sinhala?`;
  else if (ctx.format === "reversed") title = n === 1 && items[0].sinhala ? `How do you say "${items[0].sinhala}" in English?` : "Can you say these in English?";
  else if (ctx.format === "list") title = ctx.topic ? `${n} English phrases for ${ctx.topic}` : `${n} everyday English phrases with Sinhala meanings`;
  else title = ctx.extraText?.[0] ?? "English learning tip";
  title = title.replace(/\s+/g, " ").trim();
  const suffix = " #Shorts";
  if (title.length + suffix.length > YOUTUBE_TITLE_MAX) title = `${title.slice(0, YOUTUBE_TITLE_MAX - suffix.length - 1).trimEnd()}…`;
  return title + suffix;
}

// --- engine ---

export interface BuiltinCaption extends PlatformCaption {
  hookId: string;
}

/**
 * @param seed stable per piece of content (e.g. the publish source key) so its
 *   first suggestion doesn't change between visits.
 */
export function builtinCaption(ctx: CaptionContext, platform: CaptionPlatform, options: CaptionOptions, seed: string, ctaUrl: string): BuiltinCaption {
  const items = cleanItems(ctx.items);
  const topic = ctx.topic?.trim() ?? "";
  const s = `${seed}|${options.variant}`;

  // Hook - the platform is left out of the seed so a multi-platform publish shares one hook (a fair comparison later).
  const bank = HOOKS[ctx.format][options.tone];
  const usable = bank.map((h, i) => ({ h, i })).filter(({ h }) => topic || !usesTopic(h));
  const { h, i } = usable[pickIndex(usable.length, s, "hook")];
  const hook = fillHook(h, { n: Math.max(items.length, 1), topic });
  const hookId = `${ctx.format}-${options.tone}-${i}`;

  const engageBank = ENGAGE[ctx.format];
  const engage = engageBank[pickIndex(engageBank.length, s, "engage")];

  // Hashtags: fixed core + topic + a rotating slice of the pool.
  const count = HASHTAG_COUNT[platform];
  const tags = ["#LearnEnglish", "#StudyPal"];
  const topicTag = topic ? topicHashtag(topic) : null;
  if (topicTag && count >= 4) tags.push(topicTag);
  const start = pickIndex(HASHTAG_POOL.length, s, "tags");
  for (let k = 0; tags.length < count && k < HASHTAG_POOL.length; k++) tags.push(HASHTAG_POOL[(start + k) % HASHTAG_POOL.length]);
  if (platform === "youtube") tags.unshift("#Shorts");
  const hashtags = tags.slice(0, platform === "youtube" ? count + 1 : count).join(" ");

  const body =
    ctx.format === "quote"
      ? (ctx.extraText ?? []).map((t) => t.trim()).filter(Boolean)
      : items.map((it) => itemLine(it, ctx.format)).filter((l): l is string => l != null);

  const build = (lines: string[]) =>
    [hook, lines.join("\n"), platform === "tiktok" ? "" : engage, promoLine(platform, ctaUrl), hashtags].filter(Boolean).join("\n\n");

  let lines = body.slice(0, MAX_ITEMS[platform]);
  let caption = build(lines);
  while (caption.length > MAX_CHARS[platform] && lines.length > 0) {
    lines = lines.slice(0, -1);
    caption = build(lines);
  }

  return {
    caption,
    title: platform === "youtube" ? youtubeTitle(ctx, items) : undefined,
    hookId,
  };
}
