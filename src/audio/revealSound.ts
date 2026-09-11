import { findAudioFileByKeyword } from "./findByKeyword";

/** Picks the reveal-moment stinger from assets/sfx (e.g. "RevealSound.mp3"). Null if not found. */
export function findRevealSound(sfxDir: string): string | null {
  return findAudioFileByKeyword(sfxDir, ["reveal"]);
}
