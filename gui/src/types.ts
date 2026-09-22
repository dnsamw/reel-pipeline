export interface Palette {
  primary: string;
  brand2: string;
  gold: string;
  goldInk: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  background: string;
}

export interface ReelTheme {
  light: Palette;
  dark: Palette;
}

// Mirrors src/config/config.ts's ReelConfig field-for-field - kept as a
// separate copy (rather than importing config.ts's type) so the two
// projects can't accidentally end up depending on each other's build.
// MUST stay a complete structural match: ReelPreview.tsx passes an object
// of this shape straight into the real recipe-driven composition components
// (see src/compositions/recipe/CompositionFromRecipe.tsx), which expect the
// real (complete) ReelConfig - a field missing here is a compile error
// there, not a silent gap.
export interface ReelConfig {
  phrasesPerReel: number;
  introSeconds: number;
  phraseSeconds: number;
  countdownSeconds: number;
  revealSeconds: number;
  outroSeconds: number;
  transitionSeconds: number;
  fps: number;
  width: number;
  height: number;
  chapterOrderRange: [number, number] | null;
  bookId: string | null;
  ttsEnabled: boolean;
  ttsRate: number;
  theme: ReelTheme | null;
  musicVolume: number;
  tickVolume: number;
  revealSoundVolume: number;
  introVoiceVolume: number;
  phraseVoiceVolume: number;
  revealVoiceVolume: number;
  outputDir: string;
  ttsDir: string;
  musicDir: string;
  sfxDir: string;
  voiceDir: string;
  manifestPath: string;
  ctaUrl: string;
  introText: string;
  [key: string]: unknown;
}

export interface TemplateRecord {
  id: string;
  name: string;
  description: string;
  /** Which recipe (built-in id "1"/"2"/"3", or a custom recipe's id) this preset is meant for/auto-selects when applied. */
  recipeId: string;
  config: Partial<ReelConfig>;
  createdAt: string;
  updatedAt: string;
}

// Mirrors src/compositions/recipe/schema.ts's CompositionRecipe field-for-field -
// which scenes a "Composition"/recipe choice sequences. See docs/COMPOSITION_DESIGNER.md.
export type ThemeVariant = "light" | "dark";
export type GuessRevealField = "phrase" | "translationSi";

export interface IntroBeat {
  kind: "intro";
  theme: ThemeVariant;
  text: { source: "config.introText" } | { source: "literal"; value: string };
  introVoiceKeyword: "sinhala" | "english";
}
export interface PhraseBeat {
  kind: "phrase";
}
export interface CountdownBeat {
  kind: "countdown";
}
export interface RevealBeat {
  kind: "reveal";
}
export interface GuessRevealBeat {
  kind: "guessReveal";
  theme: ThemeVariant;
  prompt: GuessRevealField;
  answer: GuessRevealField;
}
export interface OutroBeat {
  kind: "outro";
  theme: ThemeVariant;
}

// Mirrors src/compositions/recipe/layers/schema.ts field-for-field - the
// `custom` beat kind, whose visual content is a Layer[] interpreted
// generically by LayerRenderer.tsx instead of a fixed scene component. See
// docs/COMPOSITION_DESIGNER.md's "A concrete design for the true visual
// designer".
export type Anchor = "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";

export interface LayerBox {
  position: { xPct: number; yPct: number };
  anchor: Anchor;
  widthPct?: number;
  heightPct?: number;
  rotationDeg: number;
  zIndex: number;
}

export type ColorRef = { source: "literal"; hex: string } | { source: "theme"; token: keyof Palette } | { source: "oppositeThemeToken"; token: "primary" | "brand2" | "gold" };

// Mirrors src/data/dataSources.ts field-for-field - the registry of record
// shapes a recipe's dataField text bindings can point at. Only "BookPhrase"
// exists today; more get added there as more Prisma models come online, see
// docs/COMPOSITION_DESIGNER.md's data-binding design.
export interface DataSourceField {
  key: string;
  label: string;
  type: "text";
}
export interface DataSourceDescriptor {
  id: string;
  label: string;
  fields: DataSourceField[];
}

export type TextRef = { source: "literal"; value: string } | { source: "config"; path: "introText" } | { source: "dataField"; field: string };

export type AnimationStep =
  | { type: "none" }
  | { type: "fade"; durationInFrames: number }
  | { type: "slide"; from: "top" | "bottom" | "left" | "right"; durationInFrames: number }
  | { type: "scaleSpring"; fromScale: number };

export interface AnimationSpec {
  enter: AnimationStep;
  exit: AnimationStep;
  delayFrames: number;
}

export interface TextLayer {
  kind: "text";
  id: string;
  box: LayerBox;
  text: TextRef;
  font: "sans" | "sinhala";
  fontSizePx: number;
  fontWeight: number;
  color: ColorRef;
  align: "left" | "center" | "right";
  animation: AnimationSpec;
}
export interface ImageLayer {
  kind: "image";
  id: string;
  box: LayerBox;
  src: { source: "asset"; path: string } | { source: "sceneFrameChrome" };
  animation: AnimationSpec;
}
export interface ShapeLayer {
  kind: "shape";
  id: string;
  box: LayerBox;
  shape: "rect" | "circle" | "ring" | "triangle" | "star" | "line";
  fill?: ColorRef;
  stroke?: ColorRef;
  strokeWidthPx?: number;
  cornerRadiusPx?: number;
  progress?: { source: "countdownProgress" };
  animation: AnimationSpec;
}
export type Layer = TextLayer | ImageLayer | ShapeLayer;

export interface CustomBeat {
  kind: "custom";
  theme: ThemeVariant;
  durationInFrames: number;
  layers: Layer[];
}

export type PerPhraseBeat = PhraseBeat | CountdownBeat | RevealBeat | GuessRevealBeat | CustomBeat;
export const PER_PHRASE_BEAT_KINDS = ["phrase", "countdown", "reveal", "guessReveal", "custom"] as const;

export interface CompositionRecipe {
  id: string;
  name: string;
  description: string;
  /** Which data/dataSources.ts registry entry (mirrored below as DataSourceDescriptor) perPhraseBeats' dataField text bindings resolve against - see docs/COMPOSITION_DESIGNER.md. */
  dataSourceId: string;
  intro: IntroBeat;
  perPhraseBeats: PerPhraseBeat[];
  outro: OutroBeat;
  transition: { at: "beforeOutro"; type: "fade" };
}

export interface RecipeRecord extends CompositionRecipe {
  /** True for the 3 code-defined recipes - read-only in the GUI, can't be edited/deleted. */
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  title: string;
}

export interface Chapter {
  id: string;
  title: string;
  order: number;
  bookId: string;
  bookTitle: string;
  phraseCount: number;
}

export interface ManifestEntry {
  batchId: string;
  template: string;
  chapterOrder: number;
  chapterTitle: string;
  phraseIds: string[];
  ttsEnabled: boolean;
  sidechain: boolean;
  outputPath: string;
  renderedAt: string;
  suggestedCaption: string;
  /** Playable URL for the rendered mp4 (server/index.ts's /media static route) - added server-side, not part of the raw manifest.json file. */
  mediaUrl: string;
}

export type Manifest = Record<string, ManifestEntry>;

export interface RenderRun {
  id: string;
  args: string[];
  status: "running" | "done" | "error";
  exitCode: number | null;
  logs: string[];
  startedAt: string;
  finishedAt: string | null;
}

// Mirrors src/data/phrase.ts's Phrase.
export interface Phrase {
  id: string;
  phrase: string;
  translationSi: string | null;
  pronunciationSi: string | null;
  explanation: string;
  explanationSi: string | null;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  order: number;
}

export interface QueueItem {
  batchId: string;
  chapterOrder: number;
  chapterTitle: string;
  phrases: Phrase[];
  rendered: boolean;
  outputPath: string | null;
  renderedAt: string | null;
}

export interface Settings {
  /** Merged onto ReelConfig's defaults as the new baseline for every render - same shape as a TemplateRecord's config. */
  config: Partial<ReelConfig>;
  /** Initial value for the "Duck music under dialogue/sfx" checkbox on Batch Render / Queue Render. */
  defaultSidechain: boolean;
  /** Initial value for the "Composition" picker on Batch Render / Queue Render - a built-in id ("1"/"2"/"3") or a custom recipe's id. */
  defaultRecipeId: string;
}

export interface FacebookPageInfo {
  id: string;
  name: string;
  connectedAt: string;
}

export interface FacebookStatus {
  page: FacebookPageInfo | null;
  /** Set when a just-completed Facebook login found more than one Page to pick from - see Settings.tsx. */
  pendingPages: { id: string; name: string }[] | null;
}

export interface Publication {
  id: string;
  batchId: string;
  template: string;
  outputPath: string;
  pageId: string;
  pageName: string;
  fbVideoId: string | null;
  fbPermalink: string | null;
  status: "uploading" | "published" | "error";
  error: string | null;
  caption: string;
  createdAt: string;
  publishedAt: string | null;
}

export interface VideoSpec {
  status: string;
  container: string;
  videoCodec: string;
  resolution: string;
  frameRate: string;
  audio: string;
  duration: string;
  namingConvention: string;
}
