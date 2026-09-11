import { listAudioFiles } from "./listAudioFiles";

/**
 * Alternates between the female/male intro voice-overs by batch index, so
 * the same voice isn't used for every reel. `keyword` filters to the right
 * question set - "sinhala" matches "WhatIsSinhalaMeaning_*" (Templates
 * 1/2's "what's the Sinhala meaning?" prompt), "english" matches Dan's
 * forthcoming "WhatIsEnglishMeaning_*" (Template 3's reversed prompt) - both
 * sets coexist in assets/voice/ without colliding.
 *
 * Deliberately does NOT fall back to a different-keyword file when the
 * requested one has no matches (e.g. Template 3 rendered before the
 * English-meaning clips are added) - playing the wrong-language intro audio
 * would be worse than a silent intro, so this returns null instead.
 */
export function pickIntroVoice(voiceDir: string, batchIndex: number, keyword: "sinhala" | "english"): string | null {
  const files = listAudioFiles(voiceDir).filter((f) => f.toLowerCase().includes(keyword));
  if (files.length === 0) return null;

  const female = files.find((f) => f.toLowerCase().includes("female"));
  const male = files.find((f) => f.toLowerCase().includes("male") && !f.toLowerCase().includes("female"));
  const voices = [female, male].filter((f): f is string => Boolean(f));

  if (voices.length === 0) return files[0];
  return voices[batchIndex % voices.length];
}
