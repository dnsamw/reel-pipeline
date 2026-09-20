import { join } from "node:path";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";
import { listAudioFiles } from "./listAudioFiles";

/**
 * Deterministic round-robin by batch index, so re-rendering the same batch
 * (e.g. a --force rerun) picks the same track and the manifest stays
 * meaningful rather than reshuffling music every run. Returns null (no
 * music layer) if assets/music is still empty.
 */
export function pickMusicTrack(musicDir: string, batchIndex: number): string | null {
  const tracks = listAudioFiles(musicDir);
  if (tracks.length === 0) return null;
  return tracks[batchIndex % tracks.length];
}

/**
 * Node-only - reads just enough of the file to get its duration, so
 * pickMusicStartFrame can stay within the track's actual length instead of
 * assuming every track is multiple minutes long (see it below).
 */
export async function getAudioDurationSeconds(musicDir: string, file: string): Promise<number> {
  const { slowDurationInSeconds } = await parseMedia({
    src: join(musicDir, file),
    reader: nodeReader,
    fields: { slowDurationInSeconds: true },
    acknowledgeRemotionLicense: true,
  });
  return slowDurationInSeconds;
}

/**
 * Deterministic start offset (in frames) into the chosen track, so reusing
 * a handful of tracks across hundreds of reels doesn't replay the same
 * opening bars every time. Capped at 30s, but never past (durationSeconds -
 * 1) - the Html5Audio `loop` prop wraps this in a Remotion <Loop>, whose
 * durationInFrames is trackDuration - trimBefore, and that must stay
 * positive or the render crashes (it went negative once assets/music picked
 * up tracks shorter than the previously-assumed 2-4 minutes).
 */
export function pickMusicStartFrame(batchIndex: number, fps: number, durationSeconds: number): number {
  const maxOffsetSeconds = Math.min(30, Math.max(0, durationSeconds - 1));
  const offsetSeconds = maxOffsetSeconds > 0 ? (batchIndex * 47) % maxOffsetSeconds : 0;
  return Math.round(offsetSeconds * fps);
}
