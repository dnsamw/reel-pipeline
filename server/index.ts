import express from "express";
import cors from "cors";
import { join, relative, extname, basename } from "node:path";
import { tmpdir } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { defaultConfig } from "../src/config/config";
import { colors as lightPalette, darkColors as darkPalette } from "../src/theme/tokens";
import { dataSources } from "../src/data/dataSources";
import { getPhrases, listBooks, listChapters, updatePhrase, disconnect } from "../src/data/getPhrases";
import { batchPhrases } from "../src/data/batch";
import { loadManifest, isRendered } from "../src/render/manifest";
import { listTemplates, getTemplate, saveTemplate, deleteTemplate, pushTemplatesToGit } from "./templates";
import { listRecipes, getRecipe, saveRecipe, deleteRecipe, writeRecipeFile, pushRecipesToGit } from "./recipes";
import { getSettings, saveSettings, resolveDefaultConfig, writeConfigPresetFile } from "./settings";
import {
  createOAuthState,
  consumeOAuthState,
  buildAuthUrl,
  exchangeCodeForLongLivedUserToken,
  fetchManagedPages,
  setPendingPages,
  getPendingPages,
  selectPendingPage,
  saveConnectedPage,
  getConnectedPage,
  disconnectPage,
  publishVideoToConnectedPage,
} from "./facebook";
import { listPublications, createPublication, markPublished, markError } from "./publications";
import { startRender, getRun, listRuns, cancelRun } from "./renderRunner";
import { introOutroVideoSpec } from "./videoSpec";

const app = express();
app.use(cors());
app.use(express.json());

// Serves rendered reels for inline playback (Monitor page) - manifest
// outputPath entries look like "output/<file>.mp4", so the GUI just needs
// to swap that "output" prefix for "/media" (see manifestOutputToMediaUrl).
app.use("/media", express.static(join(process.cwd(), defaultConfig.outputDir)));

function manifestOutputToMediaUrl(outputPath: string): string {
  return `/media/${relative(defaultConfig.outputDir, outputPath).split("\\").join("/")}`;
}

// --- Reference data for the "start render" form ---

app.get("/api/config/defaults", (_req, res) => {
  res.json(resolveDefaultConfig(defaultConfig));
});

app.get("/api/books", async (_req, res) => {
  try {
    res.json(await listBooks());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/chapters", async (req, res) => {
  try {
    const book = typeof req.query.book === "string" ? req.query.book : null;
    res.json(await listChapters(book));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Live "how many reels will this actually produce" preview for the start-render form, without rendering anything. */
app.get("/api/preview-batches", async (req, res) => {
  try {
    const book = typeof req.query.book === "string" ? req.query.book : null;
    const min = req.query.min != null ? Number(req.query.min) : null;
    const max = req.query.max != null ? Number(req.query.max) : null;
    const phrasesPerReel = req.query.phrasesPerReel != null ? Number(req.query.phrasesPerReel) : defaultConfig.phrasesPerReel;
    const range: [number, number] | null = min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max) ? [min, max] : null;

    const phrases = await getPhrases(range, book);
    const batches = batchPhrases(phrases, phrasesPerReel);
    res.json({ phraseCount: phrases.length, batchCount: batches.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/manifest", (_req, res) => {
  try {
    const manifest = loadManifest(defaultConfig.manifestPath);
    // mediaUrl added here (not just outputPath) so the GUI never needs to
    // know the "output/" <-> "/media/" static-serving convention itself.
    const withMediaUrl = Object.fromEntries(
      Object.entries(manifest).map(([key, entry]) => [key, { ...entry, mediaUrl: manifestOutputToMediaUrl(entry.outputPath) }]),
    );
    res.json(withMediaUrl);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/** Mirrors renderBatch.ts's private manifestKey() - can't import that file directly, since it's a script that runs main() at module load. */
function manifestKey(batchId: string, template: string): string {
  return template === "1" ? batchId : `t${template}-${batchId}`;
}

/**
 * Every batch in a scope (rendered or not), for the Queue Render page - lets
 * a reviewer see and correct phrase text before OR after rendering, unlike
 * Batch Render's fire-and-forget bulk mode. `template` matters here because
 * "rendered" is itself per-composition (see manifestKey) - the same batch
 * can be done under Composition 1 but not yet under Composition 3.
 */
app.get("/api/queue", async (req, res) => {
  try {
    const book = typeof req.query.book === "string" ? req.query.book : null;
    const min = req.query.min != null ? Number(req.query.min) : null;
    const max = req.query.max != null ? Number(req.query.max) : null;
    const phrasesPerReel = req.query.phrasesPerReel != null ? Number(req.query.phrasesPerReel) : defaultConfig.phrasesPerReel;
    const template = typeof req.query.template === "string" ? req.query.template : "1";
    const range: [number, number] | null = min != null && max != null && !Number.isNaN(min) && !Number.isNaN(max) ? [min, max] : null;

    const phrases = await getPhrases(range, book);
    const batches = batchPhrases(phrases, phrasesPerReel);
    const manifest = loadManifest(defaultConfig.manifestPath);

    const items = batches.map((b) => {
      const key = manifestKey(b.id, template);
      const rendered = isRendered(manifest, key);
      const entry = manifest[key];
      return {
        batchId: b.id,
        chapterOrder: b.chapterOrder,
        chapterTitle: b.chapterTitle,
        phrases: b.phrases,
        rendered,
        outputPath: rendered ? entry.outputPath : null,
        renderedAt: rendered ? entry.renderedAt : null,
      };
    });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Writes a phrase correction straight to Postgres (the shared StudyPal DB) -
 * see src/data/getPhrases.ts's updatePhrase() for why this is deliberately
 * narrow (content fields only). Only ever called from an explicit "Save
 * corrections" click, or right before a render fires from the Render Queue,
 * on the Queue Render page - never automatically.
 */
app.put("/api/phrases/:id", async (req, res) => {
  try {
    const { phrase, translationSi, pronunciationSi, explanation, explanationSi } = req.body ?? {};
    if (typeof phrase !== "string" || !phrase.trim()) return res.status(400).json({ error: "phrase is required" });
    if (typeof explanation !== "string" || !explanation.trim()) return res.status(400).json({ error: "explanation is required" });
    await updatePhrase(req.params.id, {
      phrase,
      translationSi: typeof translationSi === "string" && translationSi.trim() ? translationSi : null,
      pronunciationSi: typeof pronunciationSi === "string" && pronunciationSi.trim() ? pronunciationSi : null,
      explanation,
      explanationSi: typeof explanationSi === "string" && explanationSi.trim() ? explanationSi : null,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/video-spec", (_req, res) => {
  res.json(introOutroVideoSpec);
});

/** The built-in brand palette (theme/tokens.ts) - used by the GUI to prefill a new template's color overrides instead of guessing. */
app.get("/api/theme/default", (_req, res) => {
  res.json({ light: lightPalette, dark: darkPalette });
});

// The data-binding registry (src/data/dataSources.ts) - which record shapes
// a recipe's custom-beat text layers can bind against. See
// docs/COMPOSITION_DESIGNER.md's data-binding design.
app.get("/api/data-sources", (_req, res) => {
  res.json(Object.values(dataSources));
});

// --- Template library ---

app.get("/api/templates", (_req, res) => {
  try {
    res.json(listTemplates());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/templates/:id", (req, res) => {
  try {
    const record = getTemplate(req.params.id);
    if (!record) return res.status(404).json({ error: `No template "${req.params.id}"` });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/templates", (req, res) => {
  try {
    res.json(saveTemplate(req.body));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.put("/api/templates/:id", (req, res) => {
  try {
    res.json(saveTemplate(req.body, req.params.id));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete("/api/templates/:id", (req, res) => {
  try {
    deleteTemplate(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/templates/:id/push", async (req, res) => {
  try {
    const message =
      typeof req.body?.message === "string" && req.body.message.trim() ? req.body.message : `Update template: ${req.params.id}`;
    res.json(await pushTemplatesToGit(message));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- Composition recipes (which scenes a "Composition" choice actually sequences - see
// src/compositions/recipe/schema.ts). The 3 built-ins are read-only (listRecipes/getRecipe
// include them, saveRecipe/deleteRecipe refuse to touch their ids). ---

app.get("/api/recipes", (_req, res) => {
  try {
    res.json(listRecipes());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/recipes/:id", (req, res) => {
  try {
    const record = getRecipe(req.params.id);
    if (!record) return res.status(404).json({ error: `No recipe "${req.params.id}"` });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/recipes", (req, res) => {
  try {
    res.json(saveRecipe(req.body));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.put("/api/recipes/:id", (req, res) => {
  try {
    res.json(saveRecipe(req.body, req.params.id));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.delete("/api/recipes/:id", (req, res) => {
  try {
    deleteRecipe(req.params.id);
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post("/api/recipes/:id/push", async (req, res) => {
  try {
    const message =
      typeof req.body?.message === "string" && req.body.message.trim() ? req.body.message : `Update recipe: ${req.params.id}`;
    res.json(await pushRecipesToGit(message));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Uploads an image for a `custom` beat's image layer (LayerEditor.tsx) -
// saved under assets/images/ (Config.setPublicDir("assets") in
// remotion.config.ts, so staticFile("images/<file>") resolves it the same
// way at render time as at edit time). Raw body, not multipart - the GUI
// sends the File object directly as the request body - so this route gets
// its own express.raw() instead of relying on the global express.json().
const ALLOWED_IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
app.post("/api/assets/images", express.raw({ type: () => true, limit: "15mb" }), (req, res) => {
  try {
    const rawName = typeof req.query.filename === "string" ? req.query.filename : "upload";
    const ext = extname(rawName).toLowerCase();
    if (!ALLOWED_IMAGE_EXT.includes(ext)) {
      return res.status(400).json({ error: `Unsupported image type "${ext || "(none)"}" - use ${ALLOWED_IMAGE_EXT.join(", ")}` });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: "Empty upload" });
    const safeBase = basename(rawName, ext).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 60) || "image";
    const filename = `${Date.now()}-${safeBase}${ext}`;
    const dir = join(process.cwd(), "assets", "images");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), req.body);
    res.json({ path: `images/${filename}` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- Batch render orchestration (wraps `npm run render:batch`, doesn't replace it) ---

app.post("/api/render/start", (req, res) => {
  try {
    const { chapters, limit, force, tts, template, book, sidechain, templateId, phraseIds, recipeId } = req.body ?? {};
    const args: string[] = [];

    // phraseIds targets one exact reel (the Queue Render page's Render Queue
    // render/re-render action) - it fully determines scope, so chapters/limit/
    // force/book (the bulk-mode scope concept) don't apply and are ignored
    // rather than validated, since the GUI never sends both at once.
    const usingPhraseIds = Array.isArray(phraseIds) && phraseIds.length > 0;
    if (usingPhraseIds) {
      if (!phraseIds.every((id: unknown) => typeof id === "string" && id.trim())) {
        return res.status(400).json({ error: "phraseIds must be a non-empty array of strings" });
      }
      args.push(`--phraseIds=${phraseIds.join(",")}`);
    }

    if (!usingPhraseIds && chapters != null) {
      if (typeof chapters !== "string" || !/^\d+-\d+$/.test(chapters)) {
        return res.status(400).json({ error: "chapters must look like '0-2'" });
      }
      args.push(`--chapters=${chapters}`);
    }
    if (!usingPhraseIds && limit != null) {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: "limit must be a positive integer" });
      args.push(`--limit=${n}`);
    }
    if (!usingPhraseIds && force) args.push("--force");
    if (tts != null) args.push(`--tts=${tts === true || tts === "true"}`);
    if (sidechain) args.push("--sidechain=true");
    if (!usingPhraseIds && book != null) {
      if (typeof book !== "string" || !book.trim()) return res.status(400).json({ error: "book must be a non-empty string" });
      args.push(`--book=${book}`);
    }

    const templateRecord = templateId ? getTemplate(String(templateId)) : null;
    if (templateId && !templateRecord) return res.status(404).json({ error: `Unknown templateId "${templateId}"` });

    // Which recipe/composition to actually render with, in priority order:
    // an explicit recipeId (the GUI's Recipe picker) > an explicit template
    // number (legacy/CLI-style) > the chosen color template's own recipeId
    // (a template "remembers" which recipe it was designed for, same as it
    // always auto-selected a composition number before this existed). A
    // built-in id renders exactly like the old raw --template flag (same
    // static composition, same manifest/filename behavior); a genuinely
    // custom recipe renders through the dynamic Reel-Custom composition
    // instead, via --recipeFile (see renderBatch.ts).
    const effectiveRecipeId = recipeId != null ? String(recipeId) : template != null ? String(template) : templateRecord?.recipeId ?? null;
    const recipeRecord = effectiveRecipeId != null ? getRecipe(effectiveRecipeId) : null;
    if (effectiveRecipeId != null && !recipeRecord) return res.status(404).json({ error: `Unknown recipe "${effectiveRecipeId}"` });

    // Settings' global overrides are always the baseline; a chosen template's
    // overrides win over those (same precedence as templates vs explicit
    // flags below) - merged into one file since --presetFile only takes one.
    const mergedConfig = { ...getSettings().config, ...(templateRecord?.config ?? {}) };
    if (Object.keys(mergedConfig).length > 0) {
      const presetPath = writeConfigPresetFile(mergedConfig, join(tmpdir(), "studypal-reels-presets"));
      args.push(`--presetFile=${presetPath}`);
    }

    if (recipeRecord && !recipeRecord.builtin) {
      const recipePath = writeRecipeFile(recipeRecord, join(tmpdir(), "studypal-reels-recipes"));
      args.push(`--recipeFile=${recipePath}`);
    } else if (recipeRecord) {
      args.push(`--template=${recipeRecord.id}`);
    }

    res.json(startRender(args));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.get("/api/render", (_req, res) => {
  try {
    res.json(listRuns());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/render/:id", (req, res) => {
  try {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json({ error: "not found" });
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/render/:id/cancel", (req, res) => {
  try {
    res.json({ cancelled: cancelRun(req.params.id) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// --- GUI-wide default settings (Settings page) ---

app.get("/api/settings", (_req, res) => {
  try {
    res.json(getSettings());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.put("/api/settings", (req, res) => {
  try {
    const { config, defaultSidechain, defaultRecipeId } = req.body ?? {};
    if (defaultRecipeId != null && !getRecipe(String(defaultRecipeId))) {
      return res.status(400).json({ error: `Unknown recipe "${defaultRecipeId}"` });
    }
    res.json(
      saveSettings({
        config: config ?? {},
        defaultSidechain: Boolean(defaultSidechain),
        defaultRecipeId: defaultRecipeId ?? "1",
      }),
    );
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// --- Facebook Page connection (Settings page's "Connect with Facebook") ---

// Where the OAuth callback (a full-page browser redirect Facebook sends the
// user's browser to directly, not through Vite's dev proxy) sends the user
// back to once it's done - the Vite dev server's own origin, not the API's.
const GUI_ORIGIN = process.env.GUI_ORIGIN ?? "http://localhost:5183";

app.get("/api/facebook/status", (_req, res) => {
  res.json({ page: getConnectedPage(), pendingPages: getPendingPages() });
});

app.get("/api/facebook/connect", (_req, res) => {
  try {
    res.redirect(buildAuthUrl(createOAuthState()));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/facebook/callback", async (req, res) => {
  const { code, state, error, error_description } = req.query;
  if (error) {
    return res.redirect(`${GUI_ORIGIN}/settings?fbError=${encodeURIComponent(String(error_description ?? error))}`);
  }
  if (typeof state !== "string" || !consumeOAuthState(state) || typeof code !== "string") {
    return res.redirect(
      `${GUI_ORIGIN}/settings?fbError=${encodeURIComponent("Invalid or expired Facebook login attempt - try connecting again")}`,
    );
  }
  try {
    const userToken = await exchangeCodeForLongLivedUserToken(code);
    const pages = await fetchManagedPages(userToken);
    if (pages.length === 0) {
      return res.redirect(`${GUI_ORIGIN}/settings?fbError=${encodeURIComponent("That Facebook account doesn't admin any Pages")}`);
    }
    if (pages.length === 1) {
      saveConnectedPage(pages[0]);
      return res.redirect(`${GUI_ORIGIN}/settings?fbConnected=1`);
    }
    // More than one Page - let the admin pick which one on the Settings page
    // (single-page scope, see server/facebook.ts) rather than guessing.
    setPendingPages(pages);
    return res.redirect(`${GUI_ORIGIN}/settings?fbPick=1`);
  } catch (err) {
    res.redirect(`${GUI_ORIGIN}/settings?fbError=${encodeURIComponent(err instanceof Error ? err.message : String(err))}`);
  }
});

app.post("/api/facebook/select-page", (req, res) => {
  try {
    const { pageId } = req.body ?? {};
    if (typeof pageId !== "string" || !pageId.trim()) return res.status(400).json({ error: "pageId is required" });
    res.json(selectPendingPage(pageId));
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

app.post("/api/facebook/disconnect", (_req, res) => {
  disconnectPage();
  res.status(204).end();
});

// --- Publishing a rendered reel to the connected Facebook Page (Monitor page) ---

app.get("/api/publications", (_req, res) => {
  try {
    res.json(listPublications());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/publish", async (req, res) => {
  try {
    const { batchId, template, caption } = req.body ?? {};
    if (typeof batchId !== "string" || !batchId.trim()) return res.status(400).json({ error: "batchId is required" });
    const templateStr = typeof template === "string" ? template : "1";

    const page = getConnectedPage();
    if (!page) return res.status(400).json({ error: "No Facebook Page connected - connect one in Settings first" });

    const manifest = loadManifest(defaultConfig.manifestPath);
    const key = manifestKey(batchId, templateStr);
    if (!isRendered(manifest, key)) return res.status(404).json({ error: "This reel hasn't been rendered yet" });
    const entry = manifest[key];

    const record = createPublication({
      batchId,
      template: templateStr,
      outputPath: entry.outputPath,
      pageId: page.id,
      pageName: page.name,
      caption: typeof caption === "string" && caption.trim() ? caption : entry.suggestedCaption,
    });

    try {
      const result = await publishVideoToConnectedPage(entry.outputPath, record.caption);
      res.json(markPublished(record.id, result.videoId, result.permalink));
    } catch (err) {
      res.status(502).json(markError(record.id, err instanceof Error ? err.message : String(err)));
    }
  } catch (err) {
    res.status(400).json({ error: String(err) });
  }
});

// Last-resort safety net - catches anything that slips past a route's own
// try/catch (e.g. express.json() failing to parse a malformed request body)
// so the browser always gets `{error: "..."}` back instead of Express's
// default plain-text/HTML error page, which the GUI's fetch wrapper (see
// gui/src/api.ts) can't parse and would otherwise surface as an unhelpful
// bare "500 Internal Server Error".
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
});

const PORT = process.env.GUI_SERVER_PORT ? Number(process.env.GUI_SERVER_PORT) : 4300;
const server = app.listen(PORT, () => {
  console.log(`Reel GUI server listening on http://localhost:${PORT}`);
});

async function shutdown() {
  await disconnect();
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
