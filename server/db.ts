import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

// Tool-specific data only (templates/presets) - book/chapter/phrase data
// stays in the shared Postgres DB via Prisma (see src/data/getPhrases.ts).
// Deliberately a separate SQLite file rather than a table in that Postgres
// schema, since that schema is documented as read-only and shared with the
// separate ubuntu-node app.
const dataDir = join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(join(dataDir, "gui.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    template_number TEXT NOT NULL DEFAULT '1',
    config_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Singleton row (id = 'global') holding the GUI-wide defaults: a
  -- ReelConfig overrides blob (same shape as a template's config_json,
  -- merged in as the baseline for every render - see server/settings.ts)
  -- plus a couple of GUI-only form defaults that aren't part of ReelConfig.
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY,
    config_json TEXT NOT NULL,
    default_sidechain INTEGER NOT NULL DEFAULT 0,
    default_template_number TEXT NOT NULL DEFAULT '1',
    updated_at TEXT NOT NULL
  );

  -- One connected Facebook Page (single-page scope for now - see
  -- server/facebook.ts). access_token is a long-lived Page Access Token;
  -- this file is gitignored (see data/'s note above), same trust boundary
  -- as AZURE_SPEECH_KEY in .env - never sent to the GUI frontend.
  CREATE TABLE IF NOT EXISTS facebook_page (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    connected_at TEXT NOT NULL
  );

  -- One row per publish attempt, so Monitor can show "generated vs
  -- published" per rendered reel (matched by batch_id + template).
  CREATE TABLE IF NOT EXISTS publications (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL,
    template TEXT NOT NULL,
    output_path TEXT NOT NULL,
    page_id TEXT NOT NULL,
    page_name TEXT NOT NULL,
    fb_video_id TEXT,
    fb_permalink TEXT,
    status TEXT NOT NULL,
    error TEXT,
    caption TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    published_at TEXT
  );
`);
