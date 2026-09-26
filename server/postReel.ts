import { spawn, spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { listAudioFiles } from "../src/audio/listAudioFiles";
import { isFfmpegAvailable } from "../src/audio/ffmpeg";
import { renderPostPng } from "./postRenderer";
import { getPostTemplate } from "../src/posts/registry";
import type { PostColors, PostFields, PostLists } from "../src/posts/types";

const MUSIC_DIR = join(process.cwd(), "assets", "music");
const FPS = 30;
const REEL_W = 1080;
const REEL_H = 1920;

/**
 * Prefers ffmpeg on PATH (same one --sidechain uses); otherwise falls back to
 * the ffmpeg/ffprobe Remotion ships in its platform compositor package, so
 * this works on a machine without a system ffmpeg too.
 */
function resolveTool(name: "ffmpeg" | "ffprobe"): string {
  if (name === "ffmpeg" ? isFfmpegAvailable() : spawnSync(name, ["-version"], { stdio: "ignore" }).status === 0) return name;
  const remotionDir = join(process.cwd(), "node_modules", "@remotion");
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  for (const dir of existsSync(remotionDir) ? readdirSync(remotionDir) : []) {
    if (!dir.startsWith("compositor-")) continue;
    const p = join(remotionDir, dir, exe);
    if (existsSync(p)) return p;
  }
  throw new Error(`${name} not found - install ffmpeg or reinstall node_modules`);
}

export interface MusicTrack {
  file: string;
  durationSeconds: number | null;
}

export function listMusicTracks(): MusicTrack[] {
  let ffprobe: string | null = null;
  try {
    ffprobe = resolveTool("ffprobe");
  } catch {
    // durations are a nicety - list the tracks without them
  }
  return listAudioFiles(MUSIC_DIR)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((file) => {
      let durationSeconds: number | null = null;
      if (ffprobe) {
        const out = spawnSync(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(MUSIC_DIR, file)], { encoding: "utf8" });
        const n = parseFloat(out.stdout);
        if (Number.isFinite(n)) durationSeconds = n;
      }
      return { file, durationSeconds };
    });
}

export interface PostReelOptions {
  durationSeconds: number;
  /** File name inside assets/music, or null for silence. */
  musicFile: string | null;
  musicStartSeconds: number;
  /** 0-1 */
  musicVolume: number;
  /** "reel" letterboxes non-9:16 posts onto a 1080x1920 canvas in the post's background colour; "original" keeps the post's own size. */
  frame: "reel" | "original";
}

function runFfmpeg(bin: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr = (stderr + d).slice(-4000)));
    p.on("error", rej);
    p.on("close", (code) => (code === 0 ? res() : rej(new Error(`ffmpeg exited with ${code}:\n${stderr}`))));
  });
}

/**
 * Static-image reel: renders the post to PNG (same path as Export PNG), then
 * loops that single frame for `durationSeconds` with the chosen music track
 * (looped if shorter, faded in/out) into an H.264/AAC MP4 - no Remotion
 * video render needed, so it takes seconds rather than rendering every frame.
 */
export async function renderPostReel(
  post: { templateId: string; fields: PostFields; lists: PostLists; colors: PostColors },
  opts: PostReelOptions,
): Promise<{ mp4Path: string }> {
  const duration = Math.min(90, Math.max(3, Number(opts.durationSeconds) || 15));
  const volume = Math.min(1, Math.max(0, Number(opts.musicVolume ?? 0.8)));
  const start = Math.max(0, Number(opts.musicStartSeconds) || 0);

  let musicPath: string | null = null;
  if (opts.musicFile) {
    musicPath = resolve(MUSIC_DIR, basename(opts.musicFile));
    if (!musicPath.startsWith(MUSIC_DIR + sep) || !existsSync(musicPath)) throw new Error(`Music track not found: ${opts.musicFile}`);
  }

  const { savedPath: pngPath, width, height } = await renderPostPng(post);
  const mp4Path = pngPath.replace(/\.png$/i, ".mp4");
  const ffmpeg = resolveTool("ffmpeg");

  // Merged with the template defaults - the request may only carry overrides.
  const colors = { ...getPostTemplate(post.templateId)?.defaultColors, ...post.colors };
  const bg = (colors.background ?? "#000000").replace(/[^#0-9a-fA-F]/g, "") || "#000000";
  const videoFilter =
    opts.frame === "reel" && width * REEL_H !== height * REEL_W
      ? `scale=${REEL_W}:${REEL_H}:force_original_aspect_ratio=decrease,pad=${REEL_W}:${REEL_H}:(ow-iw)/2:(oh-ih)/2:color=${bg},format=yuv420p`
      : `scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`;

  const fadeOut = Math.min(1.5, duration / 3);
  const audioFilter = `volume=${volume},afade=t=in:st=0:d=0.4,afade=t=out:st=${(duration - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`;

  const args = [
    "-y",
    "-loop", "1", "-framerate", String(FPS), "-i", pngPath,
    // Always emit an audio track (silent if no music) - some platforms reject video-only uploads.
    ...(musicPath
      ? ["-stream_loop", "-1", "-ss", String(start), "-i", musicPath]
      : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]),
    "-t", String(duration),
    "-vf", videoFilter,
    ...(musicPath ? ["-af", audioFilter] : []),
    "-map", "0:v", "-map", "1:a",
    "-c:v", "libx264", "-tune", "stillimage", "-preset", "medium", "-crf", "18", "-r", String(FPS),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
    "-movflags", "+faststart",
    mp4Path,
  ];
  await runFfmpeg(ffmpeg, args);
  return { mp4Path };
}
