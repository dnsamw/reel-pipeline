import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import { loadFont as loadNotoSinhala } from "@remotion/google-fonts/NotoSansSinhala";
import { loadFont as loadNotoSerifSinhala } from "@remotion/google-fonts/NotoSerifSinhala";
import { loadFont as loadAbhayaLibre } from "@remotion/google-fonts/AbhayaLibre";
import { loadFont as loadYaldevi } from "@remotion/google-fonts/Yaldevi";
import { loadFont as loadGemunuLibre } from "@remotion/google-fonts/GemunuLibre";
import { loadFont as loadOpenSans } from "@remotion/google-fonts/OpenSans";
import { loadFont as loadNotoSans } from "@remotion/google-fonts/NotoSans";
import { loadFont as loadRoboto } from "@remotion/google-fonts/Roboto";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

// Font stacks shared by post templates - the families match the original
// post-templates/*.html designs, loaded through @remotion/google-fonts so the
// same code works in the GUI preview and in renderStill (which also blocks on
// these via delayRender internally).
export const postFonts = {
  display: `"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif`,
  body: `"Figtree", "Segoe UI", system-ui, sans-serif`,
  sinhala: `"Noto Sans Sinhala", "Iskoola Pota", "Nirmala UI", sans-serif`,
};

let loaded: Promise<unknown> | null = null;

/** Idempotent - every template shares one load. */
export function loadPostFonts(): Promise<unknown> {
  loaded ??= Promise.all([
    loadBricolage("normal", { weights: ["600", "700", "800"], subsets: ["latin"] }).waitUntilDone(),
    loadFigtree("normal", { weights: ["500", "600"], subsets: ["latin"] }).waitUntilDone(),
    loadNotoSinhala("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["sinhala", "latin"] }).waitUntilDone(),
  ]);
  return loaded;
}

/**
 * Sinhala font choices for templates that offer a "Sinhala font" select
 * (Vocab Post) - value = what's stored in the field, family = the CSS stack.
 * Each falls back to Noto Sans Sinhala for anything it lacks.
 */
export const sinhalaFontChoices = [
  { value: "noto-sans", label: "Noto Sans Sinhala (default)", family: postFonts.sinhala },
  { value: "noto-serif", label: "Noto Serif Sinhala", family: `"Noto Serif Sinhala", ${postFonts.sinhala}` },
  { value: "abhaya", label: "Abhaya Libre", family: `"Abhaya Libre", ${postFonts.sinhala}` },
  { value: "yaldevi", label: "Yaldevi", family: `"Yaldevi", ${postFonts.sinhala}` },
  { value: "gemunu", label: "Gemunu Libre", family: `"Gemunu Libre", ${postFonts.sinhala}` },
] as const;

export function sinhalaFontFamily(value: string | undefined): string {
  return (sinhalaFontChoices.find((f) => f.value === value) ?? sinhalaFontChoices[0]).family;
}

/**
 * English font choices (Vocab Post's "English font" select) for the title and
 * the English words. "studypal" keeps the template's own fonts (Bricolage
 * Grotesque title, Figtree words), so its family is null.
 */
export const englishFontChoices = [
  { value: "studypal", label: "StudyPal (default)", family: null },
  { value: "open-sans", label: "Open Sans", family: `"Open Sans", ${postFonts.body}` },
  { value: "noto-sans", label: "Noto Sans", family: `"Noto Sans", ${postFonts.body}` },
  { value: "roboto", label: "Roboto", family: `"Roboto", ${postFonts.body}` },
  { value: "poppins", label: "Poppins", family: `"Poppins", ${postFonts.body}` },
] as const;

/** The chosen English family, or null for the template's own fonts. */
export function englishFontFamily(value: string | undefined): string | null {
  return (englishFontChoices.find((f) => f.value === value) ?? englishFontChoices[0]).family;
}

let choicesLoaded: Promise<unknown> | null = null;
const latinWeights: Array<"400" | "500" | "600" | "700" | "800"> = ["400", "500", "600", "700", "800"];

/** loadPostFonts plus every sinhalaFontChoices and englishFontChoices family - for the templates that offer the choice. */
export function loadPostFontsWithChoices(): Promise<unknown> {
  choicesLoaded ??= Promise.all([
    loadOpenSans("normal", { weights: latinWeights, subsets: ["latin"] }).waitUntilDone(),
    loadNotoSans("normal", { weights: latinWeights, subsets: ["latin"] }).waitUntilDone(),
    loadRoboto("normal", { weights: latinWeights, subsets: ["latin"] }).waitUntilDone(),
    loadPoppins("normal", { weights: latinWeights, subsets: ["latin"] }).waitUntilDone(),
    loadPostFonts(),
    loadNotoSerifSinhala("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["sinhala", "latin"] }).waitUntilDone(),
    loadAbhayaLibre("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["sinhala", "latin"] }).waitUntilDone(),
    loadYaldevi("normal", { weights: ["400", "500", "600", "700"], subsets: ["sinhala", "latin"] }).waitUntilDone(),
    loadGemunuLibre("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["sinhala", "latin"] }).waitUntilDone(),
  ]);
  return choicesLoaded;
}
