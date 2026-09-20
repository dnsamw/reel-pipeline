import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { ReelConfig } from "../src/config/config";

const execFileAsync = promisify(execFile);

// Committed to git as one file per template - see pushTemplatesToGit below.
// SQLite (db.ts) is the live/query store the server actually reads from;
// this directory is purely the version-controlled export of it.
const TEMPLATES_DIR = join(process.cwd(), "templates");

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

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  template_number: string;
  config_json: string;
  created_at: string;
  updated_at: string;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "template";
}

function rowToRecord(row: TemplateRow): TemplateRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    templateNumber: row.template_number as TemplateRecord["templateNumber"],
    config: JSON.parse(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTemplates(): TemplateRecord[] {
  const rows = db.prepare("SELECT * FROM templates ORDER BY updated_at DESC").all() as TemplateRow[];
  return rows.map(rowToRecord);
}

export function getTemplate(id: string): TemplateRecord | null {
  const row = db.prepare("SELECT * FROM templates WHERE id = ?").get(id) as TemplateRow | undefined;
  return row ? rowToRecord(row) : null;
}

function exportToJson(record: TemplateRecord): void {
  mkdirSync(TEMPLATES_DIR, { recursive: true });
  writeFileSync(join(TEMPLATES_DIR, `${record.id}.json`), JSON.stringify(record, null, 2) + "\n");
}

/** Creates a new template (no `id`) or updates an existing one (`id` passed) - either way, writes SQLite and its JSON export together so they never drift apart. */
export function saveTemplate(input: TemplateInput, id?: string): TemplateRecord {
  const now = new Date().toISOString();
  const existing = id ? getTemplate(id) : null;
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

  db.prepare(
    `INSERT INTO templates (id, name, description, template_number, config_json, created_at, updated_at)
     VALUES (@id, @name, @description, @templateNumber, @configJson, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = @name, description = @description, template_number = @templateNumber,
       config_json = @configJson, updated_at = @updatedAt`,
  ).run({
    id: record.id,
    name: record.name,
    description: record.description,
    templateNumber: record.templateNumber,
    configJson: JSON.stringify(record.config),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

  exportToJson(record);
  return record;
}

export function deleteTemplate(id: string): void {
  db.prepare("DELETE FROM templates WHERE id = ?").run(id);
  const file = join(TEMPLATES_DIR, `${id}.json`);
  if (existsSync(file)) unlinkSync(file);
}

/** Writes this template's config overrides to a temp file for renderBatch.ts's --presetFile flag. */
export function writePresetFile(record: TemplateRecord, tmpDir: string): string {
  mkdirSync(tmpDir, { recursive: true });
  const path = join(tmpDir, `preset-${record.id}-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(record.config, null, 2));
  return path;
}

/**
 * Commits and pushes templates/*.json to the current branch - this, not the
 * save above, is the actual "push to GitHub" action, and only ever runs when
 * a user explicitly clicks it in the GUI (never automatically on save), same
 * as pushing from any other git client.
 */
export async function pushTemplatesToGit(message: string): Promise<{ pushed: boolean; output: string }> {
  const cwd = process.cwd();
  const { stdout: statusOut } = await execFileAsync("git", ["status", "--porcelain", "--", "templates"], { cwd });
  if (!statusOut.trim()) {
    return { pushed: false, output: "Nothing to commit - templates/ already matches the last commit." };
  }
  await execFileAsync("git", ["add", "templates"], { cwd });
  await execFileAsync("git", ["commit", "-m", message], { cwd });
  const { stdout: pushOut, stderr: pushErr } = await execFileAsync("git", ["push"], { cwd });
  return { pushed: true, output: [statusOut, pushOut, pushErr].filter(Boolean).join("\n") };
}
