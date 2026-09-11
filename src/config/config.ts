import { z } from "zod";

// A zod schema (not a plain TS interface) so Remotion Studio can render a
// real form in its sidebar - bounded z.number().min().max() fields become
// sliders, booleans become checkboxes, strings become text inputs. This is
// only used for interactive preview/tweaking in Studio; the production
// batch runner still reads defaultConfig below (or CLI-flag overrides).
export const configSchema = z.object({
  phrasesPerReel: z.number().int().min(1).max(6),
  introSeconds: z.number().min(0).max(10).describe("Seconds the intro 'guess the meaning' prompt holds"),
  phraseSeconds: z.number().min(0.5).max(12).describe("Seconds each phrase scene holds"),
  countdownSeconds: z.number().min(1).max(15),
  revealSeconds: z.number().min(0.5).max(12),
  outroSeconds: z.number().min(0.5).max(10),
  transitionSeconds: z.number().min(0).max(3).describe("Crossfade duration between the last reveal and the outro"),
  fps: z.number().int().min(1).max(60),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
  chapterOrderRange: z.tuple([z.number(), z.number()]).nullable(),
  bookId: z.string().nullable().describe("Book.id or a substring of Book.title - required once more than one book exists in the DB"),
  ttsEnabled: z.boolean(),
  musicVolume: z.number().min(0).max(1),
  tickVolume: z.number().min(0).max(1),
  revealSoundVolume: z.number().min(0).max(1),
  introVoiceVolume: z.number().min(0).max(1),
  phraseVoiceVolume: z.number().min(0).max(1),
  revealVoiceVolume: z.number().min(0).max(1),
  outputDir: z.string(),
  ttsDir: z.string().describe("Generated TTS audio - doubles as cache AND servable staticFile() dir since it's under assets/"),
  musicDir: z.string(),
  sfxDir: z.string(),
  voiceDir: z.string(),
  manifestPath: z.string(),
  ctaUrl: z.string().describe("Shown on the outro CTA scene - set to StudyPal's actual public URL"),
  introText: z.string().describe("On-screen text for the intro scene, spoken by the intro voice-over"),
});

export type ReelConfig = z.infer<typeof configSchema>;

export const defaultConfig: ReelConfig = {
  phrasesPerReel: 3,
  introSeconds: 3,
  phraseSeconds: 4.5,
  countdownSeconds: 5,
  revealSeconds: 5,
  outroSeconds: 3,
  transitionSeconds: 0.5,
  fps: 30,
  width: 1080,
  height: 1920,
  chapterOrderRange: null,
  bookId: null,
  ttsEnabled: false,
  musicVolume: 0.3,
  tickVolume: 0.6,
  revealSoundVolume: 0.8,
  introVoiceVolume: 1,
  phraseVoiceVolume: 1,
  revealVoiceVolume: 1,
  outputDir: "output",
  ttsDir: "assets/tts",
  musicDir: "assets/music",
  sfxDir: "assets/sfx",
  voiceDir: "assets/voice",
  manifestPath: "output/manifest.json",
  ctaUrl: "studypal.store",
  introText: "සිංහල අර්ථය කුමක්ද?",
};
