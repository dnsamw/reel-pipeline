// Every piece of on-screen text a template can recolor individually - kept
// React-free (like config.ts) so config.ts, the scenes and the GUI editor can
// all import it. A template's config.textColors maps these keys to a color;
// any key left out (or null) keeps the scene's usual palette color.
export const TEXT_COLOR_FIELDS = [
  { key: "header", label: "Header (\"StudyPal Phrasebook\")", scene: "All scenes" },
  { key: "introIcon", label: "Intro \"?\" icon", scene: "Intro" },
  { key: "introText", label: "Intro text (Sinhala)", scene: "Intro" },
  { key: "phraseNumber", label: "Phrase number badge", scene: "Phrase" },
  { key: "phrase", label: "English phrase", scene: "Phrase" },
  { key: "pronunciation", label: "Pronunciation (Sinhala)", scene: "Phrase" },
  { key: "countdown", label: "Countdown number", scene: "Countdown" },
  { key: "translation", label: "Translation (Sinhala)", scene: "Reveal" },
  { key: "explanation", label: "Explanation (English)", scene: "Reveal" },
  { key: "explanationSi", label: "Explanation (Sinhala)", scene: "Reveal" },
  { key: "outroHeading", label: "Outro heading", scene: "Outro" },
  { key: "outroSubtitle", label: "Outro subtitle", scene: "Outro" },
  { key: "outroUrl", label: "Outro URL button text", scene: "Outro" },
] as const;

export type TextColorKey = (typeof TEXT_COLOR_FIELDS)[number]["key"];

export type TextColors = Partial<Record<TextColorKey, string | null>>;
