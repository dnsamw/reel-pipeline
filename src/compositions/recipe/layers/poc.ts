import type { CustomBeat } from "./schema";

/**
 * Hand-written proof beat for Root.tsx's "LayerDesignerPOC" composition -
 * exercises every layer kind, every animation shape, both binding sources
 * (dataField + oppositeThemeToken), and the sceneFrameChrome escape hatch,
 * so a single still-frame/visual check proves the generic interpreter
 * actually works, not just that it type-checks. See
 * docs/COMPOSITION_DESIGNER.md's "A concrete design for the true visual
 * designer" section.
 */
export const pocBeat: CustomBeat = {
  kind: "custom",
  theme: "dark",
  durationInFrames: 90,
  layers: [
    { kind: "image", id: "chrome", box: { position: { xPct: 50, yPct: 50 }, anchor: "center", rotationDeg: 0, zIndex: 0 }, src: { source: "sceneFrameChrome" }, animation: { enter: { type: "none" }, exit: { type: "none" }, delayFrames: 0 } },
    {
      kind: "shape",
      id: "ring",
      box: { position: { xPct: 50, yPct: 30 }, anchor: "center", rotationDeg: 0, zIndex: 1 },
      shape: "ring",
      fill: { source: "oppositeThemeToken", token: "gold" },
      progress: { source: "countdownProgress" },
      animation: { enter: { type: "fade", durationInFrames: 15 }, exit: { type: "none" }, delayFrames: 0 },
    },
    {
      kind: "text",
      id: "heading",
      box: { position: { xPct: 50, yPct: 55 }, anchor: "center", widthPct: 80, rotationDeg: 0, zIndex: 2 },
      text: { source: "dataField", field: "phrase" },
      font: "sans",
      fontSizePx: 64,
      fontWeight: 700,
      color: { source: "theme", token: "foreground" },
      align: "center",
      animation: { enter: { type: "typewriter", durationInFrames: 30 }, exit: { type: "fade", durationInFrames: 15 }, delayFrames: 10 },
    },
    {
      kind: "text",
      id: "subheading",
      box: { position: { xPct: 50, yPct: 68 }, anchor: "center", widthPct: 70, rotationDeg: 0, zIndex: 2 },
      text: { source: "dataField", field: "translationSi" },
      font: "sinhala",
      fontSizePx: 40,
      fontWeight: 500,
      color: { source: "oppositeThemeToken", token: "primary" },
      align: "center",
      animation: { enter: { type: "scaleSpring", fromScale: 0.7 }, exit: { type: "none" }, delayFrames: 30 },
    },
    {
      kind: "shape",
      id: "badge",
      box: { position: { xPct: 88, yPct: 12 }, anchor: "center", widthPct: 8, heightPct: 4, rotationDeg: -8, zIndex: 3 },
      shape: "rect",
      fill: { source: "theme", token: "gold" },
      cornerRadiusPx: 16,
      animation: { enter: { type: "fade", durationInFrames: 10 }, exit: { type: "none" }, delayFrames: 0 },
    },
  ],
};
