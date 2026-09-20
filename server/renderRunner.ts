import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";

// Resolves tsx's actual CLI entry file (a .mjs) rather than shelling out to
// `npm run render:batch`. On Windows, spawn() can't run a .cmd/.bat file
// (npm.cmd, tsx.cmd) without shell: true, and shell: true would mean args
// built from this server's HTTP request body get interpreted by cmd.exe -
// spawning plain node against a .mjs file sidesteps both problems: no shell
// involved, so no injection surface, and no .cmd EINVAL.
const require = createRequire(import.meta.url);
const TSX_CLI = require.resolve("tsx/cli");
const RENDER_BATCH_ENTRY = join(process.cwd(), "src/render/renderBatch.ts");

export interface RenderRun {
  id: string;
  args: string[];
  status: "running" | "done" | "error";
  exitCode: number | null;
  logs: string[];
  startedAt: string;
  finishedAt: string | null;
}

// In-memory only - fine for a local single-user tool, and simpler than a
// persistence layer for something that's only ever meaningful while this
// server process is alive (there's no "resume watching a run" use case).
const runs = new Map<string, RenderRun & { proc: ChildProcess }>();

const MAX_LOG_LINES = 2000;

function toPublic(run: RenderRun & { proc: ChildProcess }): RenderRun {
  const { proc: _proc, ...rest } = run;
  return rest;
}

/**
 * Runs `tsx src/render/renderBatch.ts <args>` - the exact same script `npm
 * run render:batch` invokes (see package.json), just spawned as
 * `node <tsx-cli.mjs> <renderBatch.ts> <args>` directly instead of through
 * npm, so no shell is ever involved and args from the request body can't be
 * interpreted as shell metacharacters. This is not a duplicate render path -
 * it's the same renderBatch.ts documented in ARCHITECTURE.md.
 */
export function startRender(args: string[]): RenderRun {
  const id = randomUUID();
  const proc = spawn(process.execPath, [TSX_CLI, RENDER_BATCH_ENTRY, ...args], { cwd: process.cwd() });

  const run: RenderRun & { proc: ChildProcess } = {
    id,
    args,
    status: "running",
    exitCode: null,
    logs: [],
    startedAt: new Date().toISOString(),
    finishedAt: null,
    proc,
  };
  runs.set(id, run);

  const pushLog = (chunk: Buffer) => {
    const lines = chunk.toString("utf-8").split(/\r?\n/).filter(Boolean);
    run.logs.push(...lines);
    if (run.logs.length > MAX_LOG_LINES) run.logs.splice(0, run.logs.length - MAX_LOG_LINES);
  };
  proc.stdout?.on("data", pushLog);
  proc.stderr?.on("data", pushLog);
  proc.on("close", (code) => {
    run.status = code === 0 ? "done" : "error";
    run.exitCode = code;
    run.finishedAt = new Date().toISOString();
  });
  proc.on("error", (err) => {
    run.logs.push(`Failed to start render process: ${err.message}`);
    run.status = "error";
    run.finishedAt = new Date().toISOString();
  });

  return toPublic(run);
}

export function getRun(id: string): RenderRun | null {
  const run = runs.get(id);
  return run ? toPublic(run) : null;
}

export function listRuns(): RenderRun[] {
  return [...runs.values()].map(toPublic).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function cancelRun(id: string): boolean {
  const run = runs.get(id);
  if (!run || run.status !== "running") return false;
  run.proc.kill();
  return true;
}
