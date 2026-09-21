/**
 * Reference spec for manually-produced intro/outro video clips - surfaced in
 * the GUI (Video Spec page) so the requirements aren't just tribal knowledge.
 * Video-clip intro/outro playback itself is NOT implemented yet (IntroScene/
 * OutroScene are still React+CSS+Html5Audio - see docs/ARCHITECTURE.md) -
 * this documents the standard to produce clips against once it is, so
 * nothing has to be re-shot when that lands.
 */
export const introOutroVideoSpec = {
  status: "SPEC ONLY - clip playback isn't implemented yet. This is the standard to build clips against.",
  container: "MP4",
  videoCodec: "H.264, yuv420p pixel format (safest for Remotion's OffthreadVideo under headless Chrome)",
  resolution: "1080x1920 (portrait 9:16) - must match config.width/height exactly to avoid crop/letterbox decisions",
  frameRate: "30fps - must match config.fps, or the clip will judder unless transcoded first",
  audio:
    "Decide per clip: either bake in narration (the scene then plays only the clip's own audio track) or keep the clip silent/muted and let the pipeline keep layering TTS + music on top as it does today. Whichever is chosen affects --sidechain ducking, which keys off dialogue/sfx audio.",
  duration:
    "Fixed-length for now: a clip will be trimmed/looped to config.introSeconds / config.outroSeconds. Variable-length (clip duration drives the timeline) is a possible later upgrade, not required to start.",
  namingConvention:
    "assets/intro-videos/<description>.mp4 and assets/outro-videos/<description>.mp4, picked by keyword/rotation the same way assets/music and assets/voice already work.",
} as const;
