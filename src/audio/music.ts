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
 * Deterministic start offset (in frames) into the chosen track, so reusing
 * a handful of multi-minute tracks across hundreds of reels doesn't replay
 * the same opening bars every time. Capped at 30s, which is safe for the
 * ~2-4 minute tracks these are meant for - revisit if much shorter tracks
 * are ever added to assets/music.
 */
export function pickMusicStartFrame(batchIndex: number, fps: number): number {
  const maxOffsetSeconds = 30;
  const offsetSeconds = (batchIndex * 47) % maxOffsetSeconds;
  return Math.round(offsetSeconds * fps);
}
