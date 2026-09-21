import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { TemplatePicker } from "../components/TemplatePicker";
import { RecipePicker } from "../components/RecipePicker";
import type { Book, Chapter, ReelConfig, ReelTheme, RecipeRecord, TemplateRecord } from "../types";

export function StartRender() {
  const navigate = useNavigate();
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);

  const [book, setBook] = useState<string>("");
  const [minOrder, setMinOrder] = useState<number | "">("");
  const [maxOrder, setMaxOrder] = useState<number | "">("");
  const [limit, setLimit] = useState<number | "">("");
  const [force, setForce] = useState(false);
  const [tts, setTts] = useState<"default" | "true" | "false">("default");
  const [recipeId, setRecipeId] = useState<string>("1");
  const [sidechain, setSidechain] = useState(false);
  const [templateId, setTemplateId] = useState<string>("");

  const [preview, setPreview] = useState<{ phraseCount: number; batchCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [started, setStarted] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.books(), api.templates(), api.recipes(), api.defaults()])
      .then(([b, t, r, d]) => {
        setBooks(b);
        setTemplates(t);
        setRecipes(r);
        setDefaults(d);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api.defaultTheme().then(setDefaultTheme).catch(() => {});
    api
      .settings()
      .then((s) => {
        setSidechain(s.defaultSidechain);
        setRecipeId(s.defaultRecipeId);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    api
      .chapters(book || null)
      .then((c) => {
        setChapters(c);
        if (c.length > 0) {
          setMinOrder(Math.min(...c.map((x) => x.order)));
          setMaxOrder(Math.max(...c.map((x) => x.order)));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [book]);

  // Picking a preset re-points the Composition picker at the recipe it was
  // designed for - a preset's color/theme overrides only apply to one
  // composition (its own light/dark scenes), so rendering it against a
  // mismatched recipe silently produces unstyled output (looks like "my
  // colors were ignored"). Only fires on templateId/list changes, so
  // manually changing the picker afterward still overrides it.
  useEffect(() => {
    const selected = templates.find((t) => t.id === templateId);
    if (selected) setRecipeId(selected.recipeId);
  }, [templateId, templates]);

  useEffect(() => {
    if (!defaults) return;
    const selected = templates.find((t) => t.id === templateId);
    const phrasesPerReel = selected?.config.phrasesPerReel ?? defaults.phrasesPerReel;
    api
      .previewBatches({
        book: book || null,
        min: minOrder === "" ? null : minOrder,
        max: maxOrder === "" ? null : maxOrder,
        phrasesPerReel,
      })
      .then(setPreview)
      .catch(() => setPreview(null));
  }, [book, minOrder, maxOrder, templateId, templates, defaults]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStarting(true);
    try {
      const run = await api.startRender({
        chapters: minOrder !== "" && maxOrder !== "" ? `${minOrder}-${maxOrder}` : undefined,
        limit: limit === "" ? undefined : limit,
        force: force || undefined,
        tts: tts === "default" ? undefined : tts === "true",
        book: book || undefined,
        sidechain: sidechain || undefined,
        templateId: templateId || undefined,
        recipeId,
      });
      setStarted(run.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div>
      <h1>Batch Render</h1>
      {error && <div className="error-banner">{error}</div>}
      {started && (
        <div className="success-banner">
          Render started (run {started}).{" "}
          <a href="#" onClick={() => navigate("/")}>
            Watch it on the Monitor page
          </a>
          .
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div className="card">
          <h2>Scope</h2>
          <div className="grid">
            <div className="field">
              <label>Book</label>
              <select value={book} onChange={(e) => setBook(e.target.value)}>
                <option value="">All books (only safe with a single book in the DB)</option>
                {books.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Chapter order: from</label>
              <input
                type="number"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
            <div className="field">
              <label>Chapter order: to</label>
              <input
                type="number"
                value={maxOrder}
                onChange={(e) => setMaxOrder(e.target.value === "" ? "" : Number(e.target.value))}
              />
            </div>
          </div>
          {chapters.length > 0 && (
            <table style={{ marginTop: 14 }}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Chapter</th>
                  <th>Phrases</th>
                </tr>
              </thead>
              <tbody>
                {chapters.map((c) => (
                  <tr key={c.id}>
                    <td>{c.order}</td>
                    <td>{c.title}</td>
                    <td>{c.phraseCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview && (
            <p className="hint" style={{ marginTop: 12 }}>
              This scope matches {preview.phraseCount} phrase(s) → {preview.batchCount} reel(s) (some may already be rendered
              and will be skipped unless "force" is checked).
            </p>
          )}
        </div>

        <div className="card">
          <h2>Template &amp; style</h2>
          <div className="grid">
            <div className="field">
              <label>Apply a saved template preset</label>
              <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} defaultTheme={defaultTheme} />
              <span className="hint">Overrides durations/volumes/theme/TTS rate for this run. See Templates page.</span>
            </div>
            <div className="field">
              <label>Composition</label>
              <RecipePicker recipes={recipes} value={recipeId} onChange={setRecipeId} />
              <span className="hint">
                Auto-set from the preset above (a preset's colors only apply to the composition it was made
                for). Change it here to override.
              </span>
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Audio &amp; run options</h2>
          <div className="grid">
            <div className="field">
              <label>Narration (TTS)</label>
              <select value={tts} onChange={(e) => setTts(e.target.value as typeof tts)}>
                <option value="default">Use config default</option>
                <option value="true">On</option>
                <option value="false">Off</option>
              </select>
            </div>
            <div className="field checkbox">
              <input id="sidechain" type="checkbox" checked={sidechain} onChange={(e) => setSidechain(e.target.checked)} />
              <label htmlFor="sidechain">Duck music under dialogue/sfx (--sidechain)</label>
            </div>
            <div className="field">
              <label>Limit (new reels this run)</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="no limit"
              />
            </div>
            <div className="field checkbox">
              <input id="force" type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              <label htmlFor="force">Force re-render already-rendered batches</label>
            </div>
          </div>
        </div>

        <div className="button-row">
          <button type="submit" disabled={starting}>
            {starting ? "Starting..." : "Start render"}
          </button>
        </div>
      </form>
    </div>
  );
}
