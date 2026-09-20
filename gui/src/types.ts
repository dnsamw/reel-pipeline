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
// of this shape straight into the real Reel/ReelTemplate2/ReelTemplate3
// components, which expect the real (complete) ReelConfig - a field missing
// here is a compile error there, not a silent gap.
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
