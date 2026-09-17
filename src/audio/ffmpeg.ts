import { spawnSync } from "node:child_process";

/**
 * Cheap PATH probe, checked once per renderBatch.ts run before committing to
 * --sidechain=true - lets the pipeline warn and fall back to the normal
 * single-pass render instead of failing mid-batch on the first ffmpeg spawn.
 */
export function isFfmpegAvailable(): boolean {
  try {
    const result = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return result.status === 0;
  } catch {
    return false;
  }
}
