import { chat, parseJsonObject } from "../ai/client";
import type { CaptionContext, CaptionOptions, CaptionPlatform, PlatformCaption } from "../../src/captions/types";

const TONE_GUIDE: Record<CaptionOptions["tone"], string> = {
  friendly: "warm, casual and encouraging, like a friend who is good at English",
  challenge: "playful and competitive - dare the viewer to get it right",
  teacher: "clear and helpful like a good teacher, light on emojis",
};

const FORMAT_GUIDE: Record<CaptionContext["format"], string> = {
  quiz: "The video shows English phrases and asks viewers to guess the Sinhala meaning before a countdown reveals it. NEVER write the Sinhala meanings in the caption - that spoils the quiz. You may list the English phrases.",
  reversed: "The video shows Sinhala meanings and asks viewers to guess the English phrase before a countdown reveals it. NEVER write the English phrases in the caption - that spoils the quiz. You may list the Sinhala meanings.",
  list: "Everything is visible in the post (phrases with Sinhala meanings), so listing them is fine. Encourage saving the post.",
  quote: "A single tip or quote for English learners.",
};

const PLATFORM_GUIDE: Record<CaptionPlatform, string> = {
  facebook: "Facebook: hook line, short body, one engagement question, the book link as a full URL, 2-3 hashtags at the end.",
  instagram: "Instagram: strong first line (only ~125 chars show before 'more'), short body, a call to comment or save, say 'link in bio' (links in captions aren't clickable), 5-10 relevant hashtags at the end. Max 2200 characters.",
  tiktok: "TikTok: very short - one punchy hook line plus at most one more line, then 3-5 hashtags. Max 300 characters.",
  youtube: 'YouTube Shorts: a "title" (max 90 characters, curiosity-driven, no hashtags) plus a description with 2-3 lines, the book link and #Shorts plus 2 hashtags.',
};

/**
 * One request for every platform (fewer calls against the key's rate limit).
 * Throws on any problem - the caller falls back to the built-in engine.
 */
export async function aiCaptions(
  ctx: CaptionContext,
  platforms: CaptionPlatform[],
  options: CaptionOptions,
  ctaUrl: string,
): Promise<Partial<Record<CaptionPlatform, PlatformCaption>>> {
  const content = {
    kind: ctx.kind,
    topic: ctx.topic ?? null,
    items: ctx.items.map((it) => ({ english: it.english, sinhala: it.sinhala ?? null, pronunciation: it.pronunciation ?? null, explanation: it.explanation ?? null })),
    extraText: ctx.extraText ?? [],
  };

  const system = [
    "You write social media captions for StudyPal, which sells 'The Ultimate Sinhala-to-English Phrasebook' to Sri Lankans learning English.",
    "Goals: stop the scroll with the first line, keep people watching until the reveal, get comments/saves/shares, and promote the phrasebook without sounding like an ad.",
    "Write mainly in simple English; a short Sinhala phrase is fine where it feels natural. Keep Sinhala text exactly as given - never invent or re-spell Sinhala.",
    `Book link: ${ctaUrl}`,
    "Reply with only a JSON object, no commentary.",
  ].join("\n");

  const user = [
    `Format: ${FORMAT_GUIDE[ctx.format]}`,
    `Tone: ${TONE_GUIDE[options.tone]}.`,
    "Platforms:",
    ...platforms.map((p) => `- ${PLATFORM_GUIDE[p]}`),
    `Variation #${options.variant}: write a fresh angle, not a generic caption.`,
    "",
    "Content:",
    JSON.stringify(content, null, 2),
    "",
    `Reply as: {${platforms.map((p) => `"${p}": {"caption": "..."${p === "youtube" ? ', "title": "..."' : ""}}`).join(", ")}}`,
  ].join("\n");

  const answer = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { thinking: false, temperature: 0.9, maxTokens: 4096 },
  );

  // Platforms the answer skipped are left out - the caller fills them from the built-in engine.
  const parsed = parseJsonObject<Record<string, unknown>>(answer);
  const result: Partial<Record<CaptionPlatform, PlatformCaption>> = {};
  for (const p of platforms) {
    const entry = parsed[p] as { caption?: unknown; title?: unknown } | undefined;
    if (!entry || typeof entry.caption !== "string" || !entry.caption.trim()) continue;
    // A misplaced top-level "title" is almost always YouTube's.
    const title = typeof entry.title === "string" ? entry.title : typeof parsed.title === "string" ? parsed.title : undefined;
    result[p] = { caption: entry.caption.trim(), title: p === "youtube" && title ? title.trim().slice(0, 100) : undefined };
  }
  if (Object.keys(result).length === 0) throw new Error("AI answer had no usable captions");
  return result;
}
