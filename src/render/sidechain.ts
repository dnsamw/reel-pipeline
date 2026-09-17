import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export interface SidechainOptions {
  /** Rendered mp4 with video + voice/sfx audio - config.musicFile must have been null for this render, see renderBatch.ts. */
  dialogueVideoPath: string;
  musicDir: string;
  musicFile: string;
  musicStartFrame: number;
  fps: number;
  durationInFrames: number;
  /** Final muxed mp4 path to write - overwritten in place. */
  outputPath: string;
}

// Tuned for narrated quiz-style reels: dips the music hard as soon as any
// dialogue/sfx is audible, and recovers within a beat of silence - closer to
// a vocal-riding sidechain duck in a DAW than a slow ambient one. Not
// exposed via config.ts/configSchema - Studio's live preview can't apply an
// ffmpeg filter, so a slider there would silently do nothing.
const SIDECHAIN_THRESHOLD = 0.05;
const SIDECHAIN_RATIO = 8;
const SIDECHAIN_ATTACK_MS = 15;
const SIDECHAIN_RELEASE_MS = 300;
const SIDECHAIN_MAKEUP = 1;

/**
 * Real sidechain compression via ffmpeg's sidechaincompress filter, run as a
 * post-process on an already-rendered (music-free) reel: builds the same
 * looped music window Html5Audio would have played in the composition, ducks
 * it against the actual dialogue/sfx audio as the trigger signal, then mixes
 * the ducked music back in and remuxes with the original video stream
 * untouched (-c:v copy - this pass only ever re-encodes audio).
 *
 * Node-only; only ever called from renderBatch.ts when --sidechain=true and
 * ffmpeg is confirmed present (see audio/ffmpeg.ts's isFfmpegAvailable).
 */
export function applyMusicSidechain(options: SidechainOptions): void {
  const { dialogueVideoPath, musicDir, musicFile, musicStartFrame, fps, durationInFrames, outputPath } = options;
  const durationSeconds = durationInFrames / fps;
  const startSeconds = musicStartFrame / fps;
  const musicSource = join(musicDir, musicFile);
  const stemPath = `${outputPath}.musicstem.wav`;

  try {
    // Rebuilds the exact [trimBefore, loop] window Html5Audio plays in the
    // composition (see compositions/Reel.tsx): seek past the trimmed head
    // first, then loop only the remainder - looping from frame 0 instead
    // would replay the trimmed-off intro on every wrap, which is audibly
    // different from what Remotion actually renders.
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-ss", String(startSeconds),
        "-i", musicSource,
        "-filter_complex", `aloop=loop=-1:size=2147483647,atrim=0:${durationSeconds},asetpts=PTS-STARTPTS`,
        "-t", String(durationSeconds),
        stemPath,
      ],
      { stdio: "ignore" },
    );

    // aformat normalizes both branches to a common sample rate/layout first
    // - the music stem and the dialogue track (Remotion's own TTS/sfx mix)
    // rarely share the same source sample rate, and sidechaincompress
    // requires matching formats on both inputs.
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i", dialogueVideoPath,
        "-i", stemPath,
        "-filter_complex",
        [
          "[1:a]aformat=sample_rates=48000:channel_layouts=stereo[music]",
          "[0:a]aformat=sample_rates=48000:channel_layouts=stereo[dialogue]",
          `[music][dialogue]sidechaincompress=threshold=${SIDECHAIN_THRESHOLD}:ratio=${SIDECHAIN_RATIO}:attack=${SIDECHAIN_ATTACK_MS}:release=${SIDECHAIN_RELEASE_MS}:makeup=${SIDECHAIN_MAKEUP}[ducked]`,
          "[ducked][dialogue]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixout]",
        ].join(";"),
        "-map", "0:v",
        "-map", "[mixout]",
        "-c:v", "copy",
        "-c:a", "aac",
        "-b:a", "192k",
        outputPath,
      ],
      { stdio: "ignore" },
    );
  } finally {
    if (existsSync(stemPath)) unlinkSync(stemPath);
  }
}
