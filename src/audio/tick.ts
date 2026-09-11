import { findAudioFileByKeyword } from "./findByKeyword";

/**
 * Picks the countdown ambience track from assets/sfx (matched by filename,
 * e.g. "ClockTicking.mp3") - this is expected to be a several-second-long
 * continuous sound played once under the whole countdown, not a short
 * blip repeated per number. Returns null (silent countdown) if not found.
 */
export function findTickFile(sfxDir: string): string | null {
  return findAudioFileByKeyword(sfxDir, ["tick", "clock", "countdown"]);
}
