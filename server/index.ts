import express from "express";
import cors from "cors";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { defaultConfig } from "../src/config/config";
import { colors as lightPalette, darkColors as darkPalette } from "../src/theme/tokens";
import { getPhrases, listBooks, listChapters, disconnect } from "../src/data/getPhrases";
import { batchPhrases } from "../src/data/batch";
import { loadManifest } from "../src/render/manifest";
import { listTemplates, getTemplate, saveTemplate, deleteTemplate, writePresetFile, pushTemplatesToGit } from "./templates";
import { startRender, getRun, listRuns, cancelRun } from "./renderRunner";
import { introOutroVideoSpec } from "./videoSpec";

const app = express();
app.use(cors());
app.use(express.json());

// --- Reference data for the "start render" form ---

app.get("/api/config/defaults", (_req, res) => {
  res.json(defaultConfig);
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
    res.json(loadManifest(defaultConfig.manifestPath));
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

// --- Batch render orchestration (wraps `npm run render:batch`, doesn't replace it) ---

app.post("/api/render/start", (req, res) => {
  try {
    const { chapters, limit, force, tts, template, book, sidechain, templateId } = req.body ?? {};
    const args: string[] = [];

    if (chapters != null) {
      if (typeof chapters !== "string" || !/^\d+-\d+$/.test(chapters)) {
        return res.status(400).json({ error: "chapters must look like '0-2'" });
      }
      args.push(`--chapters=${chapters}`);
    }
    if (limit != null) {
      const n = Number(limit);
      if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: "limit must be a positive integer" });
      args.push(`--limit=${n}`);
    }
    if (force) args.push("--force");
    if (tts != null) args.push(`--tts=${tts === true || tts === "true"}`);
    if (sidechain) args.push("--sidechain=true");
    if (book != null) {
      if (typeof book !== "string" || !book.trim()) return res.status(400).json({ error: "book must be a non-empty string" });
      args.push(`--book=${book}`);
    }

    let resolvedTemplate = template != null ? String(template) : null;
    if (templateId) {
      const record = getTemplate(String(templateId));
      if (!record) return res.status(404).json({ error: `Unknown templateId "${templateId}"` });
      const presetPath = writePresetFile(record, join(tmpdir(), "studypal-reels-presets"));
      args.push(`--presetFile=${presetPath}`);
      resolvedTemplate = resolvedTemplate ?? record.templateNumber;
    }
    if (resolvedTemplate != null) {
      if (!["1", "2", "3"].includes(resolvedTemplate)) return res.status(400).json({ error: "template must be 1, 2, or 3" });
      args.push(`--template=${resolvedTemplate}`);
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
