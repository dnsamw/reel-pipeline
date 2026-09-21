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
  templateNumber: "1" | "2" | "3";
  config: Partial<ReelConfig>;
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
  /** Initial value for the "Composition" dropdown on Batch Render / Queue Render. */
  defaultTemplateNumber: "1" | "2" | "3";
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
