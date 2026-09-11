import type { ReelBatch } from "../data/batch";

export function buildCaption(batch: ReelBatch, ctaUrl: string): string {
  const phrasesLine = batch.phrases.map((p) => `"${p.phrase}"`).join(" · ");
  return [
    phrasesLine,
    "",
    `Learn the Sinhala meaning & pronunciation for 200+ everyday English phrases. Get the full phrasebook at ${ctaUrl}`,
    "",
    "#LearnEnglish #Sinhala #EnglishPhrases #StudyPal #SriLanka",
  ].join("\n");
}
