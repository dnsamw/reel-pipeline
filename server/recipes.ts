import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { db } from "./db";
import { compositionRecipeSchema, type CompositionRecipe } from "../src/compositions/recipe/schema";
import { builtInRecipes } from "../src/compositions/recipe/recipes";
import { defaultDataSourceId } from "../src/data/dataSources";

const execFileAsync = promisify(execFile);

// Committed to git as one file per custom recipe - see pushRecipesToGit
// below. SQLite (db.ts) is the live/query store; this directory is purely
// the version-controlled export of it - same pattern as templates.ts.
const RECIPES_DIR = join(process.cwd(), "recipes");

export type RecipeInput = Omit<CompositionRecipe, "id">;

/** What actually lives in the `recipe_json` column - deliberately excludes name/description/id, which are their own columns (see saveRecipe/rowToRecord). */
type RecipeBody = Pick<CompositionRecipe, "dataSourceId" | "intro" | "perPhraseBeats" | "outro" | "transition">;

export interface RecipeRecord extends CompositionRecipe {
  /** True for the 3 code-defined recipes (template-{1,2,3}.json) - read-only, never in the `recipes` SQLite table. */
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RecipeRow {
  id: string;
  name: string;
  description: string;
  recipe_json: string;
  created_at: string;
  updated_at: string;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "recipe";
}

function builtinToRecord(recipe: CompositionRecipe): RecipeRecord {
  return { ...recipe, builtin: true, createdAt: "", updatedAt: "" };
}

function rowToRecord(row: RecipeRow): RecipeRecord {
  const body = JSON.parse(row.recipe_json) as RecipeBody;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ...body,
    // Defensive fallback for a row saved before dataSourceId existed - not
    // expected in practice (see docs/COMPOSITION_DESIGNER.md), but rowToRecord
    // doesn't re-validate through compositionRecipeSchema's own .default(),
    // so a genuinely missing field wouldn't otherwise get one.
    dataSourceId: body.dataSourceId ?? defaultDataSourceId,
    builtin: false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const BUILTIN_IDS = new Set(Object.keys(builtInRecipes));

export function listRecipes(): RecipeRecord[] {
  const builtins = Object.values(builtInRecipes).map(builtinToRecord);
  const rows = db.prepare("SELECT * FROM recipes ORDER BY updated_at DESC").all() as RecipeRow[];
  return [...builtins, ...rows.map(rowToRecord)];
}

export function getRecipe(id: string): RecipeRecord | null {
  if (id in builtInRecipes) return builtinToRecord(builtInRecipes[id as keyof typeof builtInRecipes]);
  const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as RecipeRow | undefined;
  return row ? rowToRecord(row) : null;
}

function exportToJson(record: RecipeRecord): void {
  mkdirSync(RECIPES_DIR, { recursive: true });
  const { builtin: _builtin, createdAt: _createdAt, updatedAt: _updatedAt, ...recipe } = record;
  writeFileSync(join(RECIPES_DIR, `${record.id}.json`), JSON.stringify(recipe, null, 2) + "\n");
}

/** Creates a new custom recipe (no `id`) or updates an existing one (`id` passed) - refuses to touch a built-in id, same as templates.ts's saveTemplate. */
export function saveRecipe(input: RecipeInput, id?: string): RecipeRecord {
  if (id && BUILTIN_IDS.has(id)) throw new Error(`"${id}" is a built-in recipe and can't be edited - save as a new recipe instead`);

  const now = new Date().toISOString();
  const existing = id ? getRecipe(id) : null;
  const recordId = existing?.id ?? id ?? `${slugify(input.name)}-${randomUUID().slice(0, 8)}`;
  if (BUILTIN_IDS.has(recordId)) throw new Error(`"${recordId}" collides with a built-in recipe id - choose a different name`);

  const parsed = compositionRecipeSchema.parse({ id: recordId, ...input });
  const record: RecipeRecord = {
    ...parsed,
    builtin: false,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  db.prepare(
    `INSERT INTO recipes (id, name, description, recipe_json, created_at, updated_at)
     VALUES (@id, @name, @description, @recipeJson, @createdAt, @updatedAt)
     ON CONFLICT(id) DO UPDATE SET
       name = @name, description = @description, recipe_json = @recipeJson, updated_at = @updatedAt`,
  ).run({
    id: record.id,
    name: record.name,
    description: record.description,
    recipeJson: JSON.stringify({
      dataSourceId: record.dataSourceId,
      intro: record.intro,
      perPhraseBeats: record.perPhraseBeats,
      outro: record.outro,
      transition: record.transition,
    }),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });

  exportToJson(record);
  return record;
}

export function deleteRecipe(id: string): void {
  if (BUILTIN_IDS.has(id)) throw new Error(`"${id}" is a built-in recipe and can't be deleted`);
  db.prepare("DELETE FROM recipes WHERE id = ?").run(id);
  const file = join(RECIPES_DIR, `${id}.json`);
  if (existsSync(file)) unlinkSync(file);
}

/** Writes a recipe to a temp file for renderBatch.ts's --recipeFile flag - same mechanism as templates.ts's old writePresetFile / settings.ts's writeConfigPresetFile. */
export function writeRecipeFile(record: RecipeRecord, tmpDir: string): string {
  mkdirSync(tmpDir, { recursive: true });
  const { builtin: _builtin, createdAt: _createdAt, updatedAt: _updatedAt, ...recipe } = record;
  const path = join(tmpDir, `recipe-${record.id}-${Date.now()}.json`);
  writeFileSync(path, JSON.stringify(recipe, null, 2));
  return path;
}

/** Mirrors templates.ts's pushTemplatesToGit - commits/pushes recipes/*.json, only on an explicit "Push to GitHub" click. */
export async function pushRecipesToGit(message: string): Promise<{ pushed: boolean; output: string }> {
  const cwd = process.cwd();
  const { stdout: statusOut } = await execFileAsync("git", ["status", "--porcelain", "--", "recipes"], { cwd });
  if (!statusOut.trim()) {
    return { pushed: false, output: "Nothing to commit - recipes/ already matches the last commit." };
  }
  await execFileAsync("git", ["add", "recipes"], { cwd });
  await execFileAsync("git", ["commit", "-m", message], { cwd });
  const { stdout: pushOut, stderr: pushErr } = await execFileAsync("git", ["push"], { cwd });
  return { pushed: true, output: [statusOut, pushOut, pushErr].filter(Boolean).join("\n") };
}
