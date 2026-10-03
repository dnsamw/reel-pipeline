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

  -- Custom (non-built-in) composition recipes - see server/recipes.ts and
  -- src/compositions/recipe/schema.ts's CompositionRecipe. The 3 built-in
  -- recipes (template-{1,2,3}.json) are NOT rows here - they're code, read
  -- straight from src/compositions/recipe/recipes/, same reasoning as
  -- templates: this table is only ever the user-authored, editable ones.
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    recipe_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Platforms beyond the Facebook Page (Instagram now; YouTube/TikTok next) -
// one row per connected platform. Instagram reuses the Facebook Page token,
// so its access_token/refresh_token stay null; OAuth platforms fill them.
// Same trust boundary as facebook_page: never sent to the frontend.
db.exec(`
  CREATE TABLE IF NOT EXISTS social_accounts (
    platform TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    account_name TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    expires_at TEXT,
    extra_json TEXT NOT NULL DEFAULT '{}',
    connected_at TEXT NOT NULL
  );
`);

// Ad Creator presets: named snapshots per template, either an ad's words
// (kind 'text': fields, lists, Ads Manager copy) or its color overrides
// (kind 'colors') - see server/adPresets.ts.
db.exec(`
  CREATE TABLE IF NOT EXISTS ad_presets (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    name TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Additive migrations for tables created before a column existed -
// CREATE TABLE IF NOT EXISTS above never alters an existing table.
function addColumnIfMissing(table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

// publications predates multi-platform publishing: existing rows are all
// Facebook. `stage` is the live progress text of a background publish job.
addColumnIfMissing("publications", "platform", "platform TEXT NOT NULL DEFAULT 'facebook'");
addColumnIfMissing("publications", "stage", "stage TEXT");
// JSON CaptionMeta (src/captions/types.ts): how the caption was made, so
// post performance can later be compared by engine/tone/hook.
addColumnIfMissing("publications", "caption_meta", "caption_meta TEXT");
// What a successful publish actually produced: live post, TikTok draft, private/unlisted YouTube upload.
addColumnIfMissing("publications", "outcome", "outcome TEXT");
addColumnIfMissing("ad_presets", "kind", "kind TEXT NOT NULL DEFAULT 'text'");
