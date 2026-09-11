import { readdirSync } from "node:fs";
import { extname } from "node:path";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".m4a", ".ogg"];

/**
 * Lists audio files in a directory, or [] if the dir doesn't exist / is
 * empty (e.g. assets/music before tracks are sourced) - lets the pipeline
 * render silently rather than crash when no audio has been added yet.
 *
 * Node-only (uses fs) - only ever call this from renderBatch.ts, never from
 * Root.tsx/Reel.tsx/scenes, which get bundled into the browser Remotion
 * renders in.
 */
export function listAudioFiles(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => AUDIO_EXTENSIONS.includes(extname(f).toLowerCase()));
  } catch {
    return [];
  }
}
