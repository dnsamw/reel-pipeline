import { randomUUID } from "node:crypto";
import { db } from "./db";

/**
 * Ad Creator presets, per template: "text" = an ad's words (fields, lists,
 * Ads Manager copy), "colors" = its color overrides. Exported/imported as one
 * JSON file so they can move between machines.
 */
export type AdPresetKind = "text" | "colors";

export interface AdPresetData {
  fields?: Record<string, string>;
  lists?: Record<string, Record<string, string>[]>;
  headline?: string;
  primaryText?: string;
  colors?: Record<string, string>;
}

export interface AdPreset {
  id: string;
  templateId: string;
  kind: AdPresetKind;
  name: string;
  data: AdPresetData;
  createdAt: string;
}

interface Row {
  id: string;
  template_id: string;
  kind: string;
  name: string;
  data_json: string;
  created_at: string;
}

export const isPresetKind = (k: unknown): k is AdPresetKind => k === "text" || k === "colors";

const toPreset = (r: Row): AdPreset => ({
  id: r.id,
  templateId: r.template_id,
  kind: isPresetKind(r.kind) ? r.kind : "text",
  name: r.name,
  data: JSON.parse(r.data_json),
  createdAt: r.created_at,
});

/** Only the parts of `data` that belong to `kind`. */
function cleanData(kind: AdPresetKind, data: AdPresetData): AdPresetData {
  if (kind === "colors") return { colors: data.colors ?? {} };
  return { fields: data.fields ?? {}, lists: data.lists ?? {}, headline: data.headline, primaryText: data.primaryText };
}

/** One template's presets of one kind, or every preset (for export) when templateId is omitted. */
export function listAdPresets(templateId?: string, kind?: AdPresetKind): AdPreset[] {
  const rows = (
    templateId
      ? db.prepare("SELECT * FROM ad_presets WHERE template_id = ? AND kind = ? ORDER BY created_at DESC").all(templateId, kind ?? "text")
      : db.prepare("SELECT * FROM ad_presets ORDER BY template_id, kind, created_at DESC").all()
  ) as Row[];
  return rows.map(toPreset);
}

const insert = db.prepare(
  "INSERT OR IGNORE INTO ad_presets (id, template_id, kind, name, data_json, created_at) VALUES (@id, @template_id, @kind, @name, @data_json, @created_at)",
);

export function saveAdPreset(templateId: string, kind: AdPresetKind, name: string, data: AdPresetData): AdPreset {
  const row: Row = { id: randomUUID(), template_id: templateId, kind, name, data_json: JSON.stringify(cleanData(kind, data)), created_at: new Date().toISOString() };
  insert.run(row);
  return toPreset(row);
}

export function deleteAdPreset(id: string): boolean {
  return db.prepare("DELETE FROM ad_presets WHERE id = ?").run(id).changes > 0;
}

/**
 * Adds presets from an export file. Ids are kept, so importing the same file
 * twice (or a file exported from this machine) skips what's already here.
 */
export function importAdPresets(items: unknown[]): { added: number; skipped: number } {
  let added = 0;
  let skipped = 0;
  db.transaction(() => {
    for (const raw of items) {
      const p = raw as Partial<AdPreset>;
      const kind = p.kind ?? "text";
      if (typeof p.templateId !== "string" || typeof p.name !== "string" || !isPresetKind(kind) || !p.data || typeof p.data !== "object") {
        skipped++;
        continue;
      }
      const changes = insert.run({
        id: typeof p.id === "string" && p.id ? p.id : randomUUID(),
        template_id: p.templateId,
        kind,
        name: p.name,
        data_json: JSON.stringify(cleanData(kind, p.data)),
        created_at: typeof p.createdAt === "string" ? p.createdAt : new Date().toISOString(),
      }).changes;
      if (changes) added++;
      else skipped++;
    }
  })();
  return { added, skipped };
}
