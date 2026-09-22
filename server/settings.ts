import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "./db";
import type { ReelConfig } from "../src/config/config";

const SETTINGS_ID = "global";

export interface Settings {
  /** Merged onto defaultConfig as the baseline for every render, same shape/mechanism as a template's config - see writeSettingsPresetFile. */
  config: Partial<ReelConfig>;
  /** Initial value for the "Duck music under dialogue/sfx" checkbox on Batch Render / Queue Render - not a ReelConfig field, so it can't live in `config`. */
  defaultSidechain: boolean;
  /** Initial value for the "Composition" dropdown on Batch Render / Queue Render. */
  defaultTemplateNumber: "1" | "2" | "3";
}

interface SettingsRow {
  id: string;
  config_json: string;
  default_sidechain: number;
  default_template_number: string;
  updated_at: string;
}

const EMPTY: Settings = { config: {}, defaultSidechain: false, defaultTemplateNumber: "1" };

function rowToSettings(row: SettingsRow): Settings {
  return {
    config: JSON.parse(row.config_json),
    defaultSidechain: row.default_sidechain === 1,
    defaultTemplateNumber: row.default_template_number as Settings["defaultTemplateNumber"],
  };
}

export function getSettings(): Settings {
  const row = db.prepare("SELECT * FROM settings WHERE id = ?").get(SETTINGS_ID) as SettingsRow | undefined;
  return row ? rowToSettings(row) : EMPTY;
}

export function saveSettings(input: Settings): Settings {
  db.prepare(
    `INSERT INTO settings (id, config_json, default_sidechain, default_template_number, updated_at)
     VALUES (@id, @configJson, @defaultSidechain, @defaultTemplateNumber, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       config_json = @configJson, default_sidechain = @defaultSidechain,
       default_template_number = @defaultTemplateNumber, updated_at = @updatedAt`,
  ).run({
    id: SETTINGS_ID,
    configJson: JSON.stringify(input.config),
    defaultSidechain: input.defaultSidechain ? 1 : 0,
    defaultTemplateNumber: input.defaultTemplateNumber,
    updatedAt: new Date().toISOString(),
  });
  return getSettings();
}

/** defaultConfig with the saved global overrides merged on top - what every GUI page treats as "the defaults" (previews, form baselines, Template Editor's own merge). */
export function resolveDefaultConfig(defaultConfig: ReelConfig): ReelConfig {
  return { ...defaultConfig, ...getSettings().config };
}

/**
 * Writes a merged ReelConfig overrides blob to a temp file for renderBatch.ts's
 * --presetFile flag - same mechanism as templates.ts's writePresetFile, but
 * takes a plain config object so callers can merge Settings + a chosen
 * template's overrides (settings as the base, template on top) into one file,
 * since renderBatch.ts only accepts a single --presetFile.
 */
export function writeConfigPresetFile(config: Partial<ReelConfig>, tmpDir: string): string {
  mkdirSync(tmpDir, { recursive: true });
  const path = join(tmpDir, `preset-settings-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(config, null, 2));
  return path;
}
