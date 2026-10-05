import { chat, parseJsonObject } from "./ai/client";

export interface VocabWord {
  word: string;
  pron: string;
  meaning: string;
}

/**
 * Vocab Post's "Generate with AI" (gui /vocab-post): English words for a
 * topic with a Sinhala-script pronunciation and a short Sinhala meaning.
 * Throws when the AI isn't configured or answers badly - the user still has
 * the row editor, so there's no built-in fallback.
 */
export async function generateVocab(topic: string, count: number, avoid: string[]): Promise<{ subtitle: string; items: VocabWord[] }> {
  const system = [
    "You make vocabulary lists for StudyPal, which teaches English to Sinhala-speaking Sri Lankans.",
    "For each English word give:",
    '- "word": the English word or short phrase, Title Case',
    '- "pron": how it sounds, written in Sinhala script as Sri Lankans say it (e.g. Nail Polish -> නේල් පොලිෂ්)',
    '- "meaning": a short, natural Sinhala meaning (2-6 words), not a long definition',
    'Also give "subtitle": the topic title translated into natural Sinhala (English loanwords like "English" may stay in English).',
    "Use common, useful words. No duplicates. Reply with only a JSON object, no commentary.",
  ].join("\n");

  const user = [
    `Topic: ${topic}`,
    `Number of words: ${count}`,
    avoid.length ? `Don't repeat these words: ${avoid.join(", ")}` : "",
    "",
    'Reply as: {"subtitle": "...", "items": [{"word": "...", "pron": "...", "meaning": "..."}]}',
  ]
    .filter((line) => line !== "")
    .join("\n");

  const answer = await chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { thinking: false, temperature: 0.6, maxTokens: 4096 },
  );
  const parsed = parseJsonObject<{ subtitle?: unknown; items?: unknown }>(answer);
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it: Record<string, unknown>) => ({ word: str(it?.word), pron: str(it?.pron), meaning: str(it?.meaning) }))
    .filter((it) => it.word)
    .slice(0, count);
  if (items.length === 0) throw new Error("AI didn't return any words - try again");
  return { subtitle: str(parsed.subtitle), items };
}
