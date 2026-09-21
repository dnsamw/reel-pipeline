import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ReelPreview } from "../components/ReelPreview";
import { RecipePicker } from "../components/RecipePicker";
import { ReelConfigNumberFields, ReelConfigPaletteFields } from "../components/ReelConfigFields";
import type { Palette, RecipeRecord, ReelConfig, ReelTheme, TemplateRecord } from "../types";

type ConfigOverrides = Partial<ReelConfig>;

export function TemplateEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipeId, setRecipeId] = useState<string>("1");
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [config, setConfig] = useState<ConfigOverrides>({});
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id ?? null);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    api.defaultTheme().then(setDefaultTheme).catch(() => {});
    api.recipes().then(setRecipes).catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // Fetched unconditionally (not just for `isNew`) - the live preview needs
    // every ReelConfig field populated with a concrete value, but an existing
    // template's saved `config` may only contain the fields it overrides.
    api.defaults().then((d) => {
      setDefaults(d);
      if (isNew) setConfig(stripNonOverridable(d));
    });
    if (isNew) return;
    api
      .template(id!)
      .then((t) => {
        setName(t.name);
        setDescription(t.description);
        setRecipeId(t.recipeId);
        setConfig(t.config);
        setThemeEnabled(t.config.theme != null);
        setSavedId(t.id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id, isNew]);

  function stripNonOverridable(d: ReelConfig): ConfigOverrides {
    const { fps: _fps, width: _width, height: _height, theme: _theme, ...rest } = d;
    return rest;
  }

  function setField<K extends keyof ReelConfig>(key: K, value: ReelConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function setPaletteField(variant: "light" | "dark", key: keyof Palette, value: string) {
    setConfig((c) => {
      const base: ReelTheme = c.theme ?? defaultTheme ?? { light: {} as Palette, dark: {} as Palette };
      return { ...c, theme: { ...base, [variant]: { ...base[variant], [key]: value } } };
    });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        recipeId,
        config: { ...config, theme: themeEnabled ? config.theme ?? defaultTheme ?? null : null },
      };
      const record: TemplateRecord = savedId ? await api.updateTemplate(savedId, payload) : await api.createTemplate(payload);
      setSavedId(record.id);
      setStatus("Saved to SQLite and exported to templates/" + record.id + ".json");
      if (isNew) navigate(`/templates/${record.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPush() {
    if (!savedId) return;
    const message = prompt("Commit message for templates/*.json", `Update template: ${name}`);
    if (!message) return;
    setPushing(true);
    setError(null);
    try {
      const result = await api.pushTemplates(savedId, message);
      setStatus(result.output || (result.pushed ? "Pushed." : "Nothing to push."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }

  const lightPalette = config.theme?.light ?? defaultTheme?.light;
  const darkPalette = config.theme?.dark ?? defaultTheme?.dark;
  const selectedRecipe = recipes.find((r) => r.id === recipeId) ?? null;

  // Merges defaults under the current overrides so every field has a
  // concrete value (buildTimeline/etc. can't tolerate undefined), without
  // needing timing/audio to be accurate - see ReelPreview.tsx.
  const previewConfig: ReelConfig | null = defaults
    ? { ...defaults, ...config, theme: themeEnabled ? config.theme ?? defaultTheme ?? null : null }
    : null;

  return (
    <div>
      <h1>{isNew ? "New Template" : `Edit: ${name || id}`}</h1>
      {error && <div className="error-banner">{error}</div>}
      {status && <div className="success-banner">{status}</div>}

      <div className="editor-layout">
      <form onSubmit={onSave} className="editor-form">
        <div className="card">
          <h2>Basics</h2>
          <div className="grid">
            <div className="field">
              <label>Name</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="field">
              <label>Composition</label>
              <RecipePicker recipes={recipes} value={recipeId} onChange={setRecipeId} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Description</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Timing &amp; audio</h2>
          <ReelConfigNumberFields config={config} onChange={setField} />
        </div>

        <div className="card">
          <h2>Copy</h2>
          <div className="grid">
            <div className="field">
              <label>CTA URL</label>
              <input type="text" value={(config.ctaUrl as string) ?? ""} onChange={(e) => setField("ctaUrl", e.target.value)} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Intro text</label>
              <input type="text" value={(config.introText as string) ?? ""} onChange={(e) => setField("introText", e.target.value)} />
              {selectedRecipe?.intro.text.source === "literal" && (
                <span className="hint">
                  "{selectedRecipe.name}"'s intro uses its own fixed text (edit it on the Recipes page) and
                  isn't affected by this field.
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Colors</h2>
          <div className="field checkbox" style={{ marginBottom: 14 }}>
            <input id="theme-enabled" type="checkbox" checked={themeEnabled} onChange={(e) => setThemeEnabled(e.target.checked)} />
            <label htmlFor="theme-enabled">Override the brand palette for this template</label>
          </div>
          {themeEnabled && lightPalette && darkPalette && (
            <>
              <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>Light scenes</h2>
              <ReelConfigPaletteFields variant="light" palette={lightPalette} onChange={(k, v) => setPaletteField("light", k, v)} />
              <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 18 }}>
                Dark scenes (dark-theme beats)
              </h2>
              <ReelConfigPaletteFields variant="dark" palette={darkPalette} onChange={(k, v) => setPaletteField("dark", k, v)} />
            </>
          )}
        </div>

        <div className="button-row">
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save template"}
          </button>
          <button type="button" className="secondary" disabled={!savedId || pushing} onClick={onPush}>
            {pushing ? "Pushing..." : "Push to GitHub"}
          </button>
        </div>
        {!savedId && <p className="hint">Save at least once before pushing - the JSON export is written on save.</p>}
      </form>

      <aside className="editor-preview">
        <div className="card preview-card">
          <h2>Live preview</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Shows the colors above on the selected composition, with sample text. Durations are approximate -
            this is for checking colors, not final timing.
          </p>
          {previewConfig && selectedRecipe ? (
            <ReelPreview recipe={selectedRecipe} config={previewConfig} />
          ) : (
            <div className="preview-frame preview-loading">
              <span className="hint">Loading...</span>
            </div>
          )}
        </div>
      </aside>
      </div>
    </div>
  );
}
