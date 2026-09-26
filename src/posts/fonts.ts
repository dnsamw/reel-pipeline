import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import { loadFont as loadNotoSinhala } from "@remotion/google-fonts/NotoSansSinhala";

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
    loadNotoSinhala("normal", { weights: ["500", "600"], subsets: ["sinhala"] }).waitUntilDone(),
  ]);
  return loaded;
}
