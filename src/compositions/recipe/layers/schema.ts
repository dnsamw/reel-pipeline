import { z } from "zod";

/**
 * `compositionRecipeSchema` (../schema.ts) recombines the *existing* 6 beat
 * components (intro/phrase/countdown/reveal/guessReveal/outro) but can't
 * invent a new visual layout - fonts/positions/colors/animation curves are
 * still hardcoded inside each scene's .tsx. This file adds a 7th beat kind,
 * `custom`, whose visual content is pure data instead - a sequence of
 * `Layer`s interpreted generically by `LayerRenderer.tsx`, so a genuinely
 * new layout (once a GUI editor exists for it) doesn't need a new scene
 * component. `custom` is wired into ../schema.ts's `perPhraseBeatSchema`
 * union. See docs/COMPOSITION_DESIGNER.md, "A concrete design for the true
 * visual designer" for the full write-up, scope estimate, and what's
 * deliberately left out (still no canvas editor - recipes/GUI author a
 * `custom` beat's layers as hand-written JSON today, same as any other
 * recipe field).
 */

const themeSchema = z.enum(["light", "dark"]);

// ---- Geometry --------------------------------------------------------
// Percent-of-canvas, not pixels - every existing scene already centers/
// offsets content this way (see e.g. IntroScene.tsx), so a layer doesn't
// need to know the canvas is exactly 1080x1920.
const pointPctSchema = z.object({ xPct: z.number(), yPct: z.number() });

const anchorSchema = z.enum([
  "top-left", "top-center", "top-right",
  "center-left", "center", "center-right",
  "bottom-left", "bottom-center", "bottom-right",
]);

/** Where a layer sits and how big it is - shared by every layer kind below. */
const layerBoxSchema = z.object({
  position: pointPctSchema, // where `anchor` of this box sits, in % of canvas
  anchor: anchorSchema.default("center"),
  widthPct: z.number().optional(), // omitted = intrinsic size (e.g. text auto-width)
  heightPct: z.number().optional(),
  rotationDeg: z.number().default(0),
  zIndex: z.number().default(0),
});

// ---- Data binding ------------------------------------------------------
// A closed union of "where a value comes from", not a free expression
// language - keeps this evaluable by a simple switch in the renderer, no
// eval()/template-string parsing, and keeps every possible value grep-able.

/** Mirrors theme/tokens.ts's Palette keys exactly. */
const colorRefSchema = z.union([
  z.object({ source: z.literal("literal"), hex: z.string() }),
  z.object({
    source: z.literal("theme"),
    token: z.enum(["primary", "brand2", "gold", "goldInk", "foreground", "mutedForeground", "border", "background"]),
  }),
  /** OutroScene.tsx's existing cross-palette contrast rule, made selectable instead of hardcoded - "the accent from the palette THIS beat's theme isn't using". */
  z.object({ source: z.literal("oppositeThemeToken"), token: z.enum(["primary", "brand2", "gold"]) }),
]);

const textRefSchema = z.union([
  z.object({ source: z.literal("literal"), value: z.string() }),
  z.object({ source: z.literal("config"), path: z.enum(["introText"]) }), // grows as more config fields become bindable
  z.object({
    source: z.literal("phraseField"),
    // Matches data/phrase.ts's Phrase fields exactly.
    field: z.enum(["phrase", "translationSi", "pronunciationSi", "explanation", "explanationSi"]),
  }),
]);

// ---- Animation -----------------------------------------------------------
// A closed set of animation "shapes" with the same frame-timing knobs every
// existing scene's interpolate()/spring() calls already use - not arbitrary
// keyframes, which would need a real curve editor to be usable and isn't
// blocking anything today.
const animationStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("fade"), durationInFrames: z.number() }),
  z.object({ type: z.literal("slide"), from: z.enum(["top", "bottom", "left", "right"]), durationInFrames: z.number() }),
  z.object({ type: z.literal("scaleSpring"), fromScale: z.number().default(0.8) }),
]);

const animationSchema = z.object({
  enter: animationStepSchema.default({ type: "none" }),
  exit: animationStepSchema.default({ type: "none" }),
  delayFrames: z.number().default(0),
});

// ---- Layer kinds -----------------------------------------------------
// Deliberately just 3 kinds (text/image/shape) - every existing scene's
// visible content is one of these three, plus SceneFrame's shared chrome
// (below) and a couple of frame-driven "progress" values (the countdown
// ring, the reveal stinger) that need their own binding rather than a new
// kind each.

const textLayerSchema = z.object({
  kind: z.literal("text"),
  id: z.string(),
  box: layerBoxSchema,
  text: textRefSchema,
  font: z.enum(["sans", "sinhala"]), // theme/fonts.ts's two families
  fontSizePx: z.number(),
  fontWeight: z.number().default(600),
  color: colorRefSchema,
  align: z.enum(["left", "center", "right"]).default("center"),
  animation: animationSchema,
});

const imageLayerSchema = z.object({
  kind: z.literal("image"),
  id: z.string(),
  box: layerBoxSchema,
  src: z.union([
    z.object({ source: z.literal("asset"), path: z.string() }),
    /** SceneFrame's background blobs, today unconditional on every themed beat - opt-in per layer instead. */
    z.object({ source: z.literal("sceneFrameChrome") }),
  ]),
  animation: animationSchema,
});

const shapeLayerSchema = z.object({
  kind: z.literal("shape"),
  id: z.string(),
  box: layerBoxSchema,
  shape: z.enum(["rect", "circle", "ring", "triangle", "star", "line"]),
  fill: colorRefSchema.optional(),
  stroke: colorRefSchema.optional(),
  strokeWidthPx: z.number().optional(),
  cornerRadiusPx: z.number().optional(),
  /** CountdownScene's ring fill-fraction - a frame-driven value, not a static prop, so it's a binding rather than a number. */
  progress: z.object({ source: z.literal("countdownProgress") }).optional(),
  animation: animationSchema,
});

const layerSchema = z.discriminatedUnion("kind", [textLayerSchema, imageLayerSchema, shapeLayerSchema]);

/**
 * A themed, timed bag of layers - what a canvas editor would actually
 * produce. Sketched as its own beat kind (not a replacement for the
 * existing 6) so it could sit alongside them in beatSchema's discriminated
 * union in ../schema.ts once built: existing compositions keep using the
 * hand-written scene components (cheaper to render, already proven
 * byte-identical), new ones can opt into `custom` for a layout none of the
 * 6 existing kinds cover.
 */
export const customBeatSchema = z.object({
  kind: z.literal("custom"),
  theme: themeSchema,
  durationInFrames: z.number(),
  layers: z.array(layerSchema).min(1),
});

export type CustomBeat = z.infer<typeof customBeatSchema>;
export type Layer = z.infer<typeof layerSchema>;
export type ColorRef = z.infer<typeof colorRefSchema>;
export type TextRef = z.infer<typeof textRefSchema>;
