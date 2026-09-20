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
`);
