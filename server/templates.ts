import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import type { ReelConfig } from "../src/config/config";

const execFileAsync = promisify(execFile);

// The JSON files themselves are the template store (one file per template,
// named <id>.json) - there is no database copy. templates-images/ holds the
// presets built around a background image (config.backgroundImage - see
// assets/background-images), templates/ holds the rest. Both are committed
// to git - see pushTemplatesToGit below.
const IMAGE_TEMPLATES_DIR = join(process.cwd(), "templates-images");
const TEMPLATES_DIR = join(process.cwd(), "templates");
const TEMPLATE_DIRS = [IMAGE_TEMPLATES_DIR, TEMPLATES_DIR];

export interface TemplateInput {
  name: string;
  description?: string;
  /** Which composition this preset is meant for - see renderBatch.ts's Template type. */
  templateNumber: "1" | "2" | "3";
  /** Overrides merged onto defaultConfig at render time via --presetFile - see renderBatch.ts. */
  config: Partial<ReelConfig>;
}

export interface TemplateRecord extends TemplateInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "template";
}

/** Path of an existing template's JSON file, or null if no folder has it. */
function findTemplateFile(id: string): string | null {
  for (const dir of TEMPLATE_DIRS) {
    const file = join(dir, `${id}.json`);
    if (existsSync(file)) return file;
  }
  return null;
}

function readTemplateFile(file: string): TemplateRecord {
  const record = JSON.parse(readFileSync(file, "utf-8")) as TemplateRecord;
  return { ...record, description: record.description ?? "" };
}

export function listTemplates(): TemplateRecord[] {
  const records: TemplateRecord[] = [];
  for (const dir of TEMPLATE_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      try {
        records.push(readTemplateFile(join(dir, file)));
      } catch (err) {
        console.error(`Skipping unreadable template ${join(dir, file)}:`, err);
      }
    }
  }
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getTemplate(id: string): TemplateRecord | null {
  const file = findTemplateFile(id);
  return file ? readTemplateFile(file) : null;
}

/** Creates a new template (no `id`) or updates an existing one (`id` passed) by writing its JSON file. An existing template stays in the folder it's already in; a new one goes to templates-images/ if it uses a background image, else templates/. */
export function saveTemplate(input: TemplateInput, id?: string): TemplateRecord {
  const now = new Date().toISOString();
  const existingFile = id ? findTemplateFile(id) : null;
  const existing = existingFile ? readTemplateFile(existingFile) : null;
  const recordId = existing?.id ?? id ?? `${slugify(input.name)}-${randomUUID().slice(0, 8)}`;
  const record: TemplateRecord = {
    id: recordId,
    name: input.name,
    description: input.description ?? "",
    templateNumber: input.templateNumber,
    config: input.config,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const dir = input.config.backgroundImage ? IMAGE_TEMPLATES_DIR : TEMPLATES_DIR;
  const file = existingFile ?? join(dir, `${record.id}.json`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n");
  return record;
}

export function deleteTemplate(id: string): void {
  const file = findTemplateFile(id);
  if (file) unlinkSync(file);
}

/**
 * Commits and pushes templates/*.json and templates-images/*.json to the current branch - this, not the
 * save above, is the actual "push to GitHub" action, and only ever runs when
 * a user explicitly clicks it in the GUI (never automatically on save), same
 * as pushing from any other git client.
 */
export async function pushTemplatesToGit(message: string): Promise<{ pushed: boolean; output: string }> {
  const cwd = process.cwd();
  const { stdout: statusOut } = await execFileAsync("git", ["status", "--porcelain", "--", "templates", "templates-images"], { cwd });
  if (!statusOut.trim()) {
    return { pushed: false, output: "Nothing to commit - templates/ and templates-images/ already match the last commit." };
  }
  await execFileAsync("git", ["add", "templates", "templates-images"], { cwd });
  await execFileAsync("git", ["commit", "-m", message], { cwd });
  const { stdout: pushOut, stderr: pushErr } = await execFileAsync("git", ["push"], { cwd });
  return { pushed: true, output: [statusOut, pushOut, pushErr].filter(Boolean).join("\n") };
}
