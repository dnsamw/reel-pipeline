import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "../db";

/**
 * Claude Code (`claude -p`) and the Grok CLI run on the owner's own
 * subscriptions: no API keys, no API bills (studypal-lms docs/16 §5). Claude
 * runs with no tools and no MCP servers: it only reads the prompt and writes
 * an answer. Grok may use its web and X search (that's what it is for).
 *
 * Every call is logged in `ai_calls`, so a batch can be counted before and
 * after it runs ("count calls before any big batch").
 */

const CLAUDE = process.env.CLAUDE_BIN ?? "claude";
const GROK = process.env.GROK_BIN ?? "grok";

db.exec(`
  CREATE TABLE IF NOT EXISTS ai_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tool TEXT NOT NULL,
    label TEXT NOT NULL,
    at TEXT NOT NULL,
    ms INTEGER NOT NULL,
    ok INTEGER NOT NULL,
    cost_usd REAL,
    error TEXT
  );
`);

function logCall(tool: "claude" | "grok", label: string, startedAt: number, ok: boolean, cost: number | null, error?: string): void {
  db.prepare("INSERT INTO ai_calls (tool, label, at, ms, ok, cost_usd, error) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    tool, label, new Date(startedAt).toISOString(), Date.now() - startedAt, ok ? 1 : 0, cost, error?.slice(0, 500) ?? null,
  );
}

/** Calls per tool since `sinceIso` (default: the last 7 days). */
export function aiCallCounts(sinceIso = new Date(Date.now() - 7 * 864e5).toISOString()): { tool: string; calls: number; failed: number }[] {
  return db
    .prepare("SELECT tool, COUNT(*) AS calls, SUM(CASE WHEN ok = 1 THEN 0 ELSE 1 END) AS failed FROM ai_calls WHERE at >= ? GROUP BY tool")
    .all(sinceIso) as { tool: string; calls: number; failed: number }[];
}

const versions = new Map<string, { ok: boolean; version?: string; error?: string }>();
/** Checked once per server run. */
export function cliVersion(tool: "claude" | "grok"): { ok: boolean; version?: string; error?: string } {
  const hit = versions.get(tool);
  if (hit) return hit;
  const r = spawnSync(tool === "claude" ? CLAUDE : GROK, ["--version"], { encoding: "utf8", timeout: 20_000, windowsHide: true });
  const v = r.error || r.status !== 0 ? { ok: false, error: r.error?.message ?? (r.stderr?.trim() || `${tool} --version failed`) } : { ok: true, version: r.stdout.trim() };
  versions.set(tool, v);
  return v;
}

function run(bin: string, args: string[], stdin: string | null, timeoutMs: number, cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, windowsHide: true, env: process.env });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => p.kill(), timeoutMs);
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Couldn't start ${bin}: ${e.message}. Is it installed and logged in?`));
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (stdin !== null) p.stdin.end(stdin);
    else p.stdin.end();
  });
}

export interface ClaudeOptions {
  /** Shown in the call log ("plan-week: write", "critic"…). */
  label: string;
  system?: string;
  /** JSON Schema: the answer comes back validated as `structured`. */
  schema?: object;
  /** Model alias or id; default = the owner's Claude Code default. */
  model?: string;
  timeoutMs?: number;
}

export interface ClaudeResult<T> {
  text: string;
  structured: T | null;
  costUsd: number | null;
  ms: number;
}

/** One `claude -p` call with no tools. Throws with Claude's own message on failure. */
export async function claude<T = unknown>(prompt: string, opts: ClaudeOptions): Promise<ClaudeResult<T>> {
  const started = Date.now();
  const args = ["-p", "--output-format", "json", "--tools", "", "--strict-mcp-config", "--no-session-persistence", "--disable-slash-commands"];
  // Windows caps a command line at ~32k characters: a long system prompt goes on stdin instead.
  if (opts.system && opts.system.length <= 8000) args.push("--system-prompt", opts.system);
  else if (opts.system) prompt = `INSTRUCTIONS (follow them exactly):\n${opts.system}\n\n---\n\n${prompt}`;
  if (opts.schema) args.push("--json-schema", JSON.stringify(opts.schema));
  const model = opts.model ?? process.env.PLANNER_CLAUDE_MODEL;
  if (model) args.push("--model", model);
  // A neutral folder: no project CLAUDE.md or skills get pulled into a writing task.
  const cwd = mkdtempSync(join(tmpdir(), "studio-claude-"));
  try {
    const r = await run(CLAUDE, args, prompt, opts.timeoutMs ?? 300_000, cwd);
    let body: any = null;
    try {
      body = JSON.parse(r.stdout);
    } catch {
      // not JSON: handled below
    }
    if (!body || body.is_error || r.code !== 0) {
      const msg = (body?.result || r.stderr.trim() || r.stdout.trim() || `claude exited ${r.code}`).slice(-600);
      logCall("claude", opts.label, started, false, body?.total_cost_usd ?? null, msg);
      throw new Error(`Claude: ${msg}`);
    }
    if (opts.schema && body.structured_output == null) {
      logCall("claude", opts.label, started, false, body.total_cost_usd ?? null, "no structured output");
      throw new Error("Claude didn't return the structured answer");
    }
    logCall("claude", opts.label, started, true, body.total_cost_usd ?? null);
    return { text: String(body.result ?? ""), structured: (body.structured_output ?? null) as T | null, costUsd: body.total_cost_usd ?? null, ms: Date.now() - started };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** One Grok CLI call (it may search the web and X). Returns Grok's answer text. */
export async function grok(prompt: string, opts: { label: string; timeoutMs?: number }): Promise<{ text: string; costUsd: number | null; ms: number }> {
  const started = Date.now();
  const cwd = mkdtempSync(join(tmpdir(), "studio-grok-"));
  try {
    const file = join(cwd, "prompt.txt");
    writeFileSync(file, prompt, "utf8");
    const r = await run(GROK, ["--prompt-file", file, "--output-format", "json", "--no-subagents"], null, opts.timeoutMs ?? 300_000, cwd);
    let body: any = null;
    try {
      body = JSON.parse(r.stdout);
    } catch {
      // handled below
    }
    if (!body || typeof body.text !== "string" || r.code !== 0) {
      const msg = (r.stderr.trim() || r.stdout.trim() || `grok exited ${r.code}`).slice(-600);
      logCall("grok", opts.label, started, false, null, msg);
      throw new Error(`Grok: ${msg}`);
    }
    logCall("grok", opts.label, started, true, body.total_cost_usd ?? null);
    return { text: body.text.trim(), costUsd: body.total_cost_usd ?? null, ms: Date.now() - started };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
