import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ReelPreview } from "../components/ReelPreview";
import { ColorField, ReelConfigNumberFields, ReelConfigPaletteFields } from "../components/ReelConfigFields";
import type { Palette, ReelConfig, ReelTheme, TemplateRecord } from "../types";
import { TEXT_COLOR_FIELDS, type TextColorKey } from "../../../src/theme/textColors";
import { RANDOM_BACKGROUND_IMAGE } from "../../../src/config/config";

type ConfigOverrides = Partial<ReelConfig>;

export function TemplateEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateNumber, setTemplateNumber] = useState<"1" | "2" | "3">("1");
  const [config, setConfig] = useState<ConfigOverrides>({});
  const [themeEnabled, setThemeEnabled] = useState(false);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);
  const [backgroundImages, setBackgroundImages] = useState<string[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id ?? null);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    api.backgroundImages().then(setBackgroundImages).catch(() => {});
  }, []);

  useEffect(() => {
    api.defaultTheme().then(setDefaultTheme).catch(() => {});
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
        setTemplateNumber(t.templateNumber);
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

  function setTextColor(key: TextColorKey, value: string) {
    setConfig((c) => {
      const next = { ...(c.textColors ?? {}) };
      if (value) next[key] = value;
      else delete next[key];
      return { ...c, textColors: Object.keys(next).length ? next : null };
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
        templateNumber,
        config: { ...config, theme: themeEnabled ? config.theme ?? defaultTheme ?? null : null },
      };
      const record: TemplateRecord = savedId ? await api.updateTemplate(savedId, payload) : await api.createTemplate(payload);
      setSavedId(record.id);
      setStatus("Saved to " + record.id + ".json");
      if (isNew) navigate(`/templates/${record.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPush() {
    if (!savedId) return;
    const message = prompt("Commit message for the template JSON files", `Update template: ${name}`);
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

  // Merges defaults under the current overrides so every field has a
  // concrete value (buildTimeline/etc. can't tolerate undefined), without
  // needing timing/audio to be accurate - see ReelPreview.tsx.
  const isRandomBackground = config.backgroundImage === RANDOM_BACKGROUND_IMAGE;
  // Real renders pick a new image per reel (renderBatch.ts) - the preview
  // just shows one of them, re-picked each time "Random" is selected.
  const randomPreviewImage = useMemo(
    () => (backgroundImages.length ? backgroundImages[Math.floor(Math.random() * backgroundImages.length)] : null),
    [backgroundImages, isRandomBackground],
  );
  const previewConfig: ReelConfig | null = defaults
    ? {
        ...defaults,
        ...config,
        backgroundImage: isRandomBackground ? randomPreviewImage : config.backgroundImage ?? defaults.backgroundImage,
        theme: themeEnabled ? config.theme ?? defaultTheme ?? null : null,
      }
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
              <select value={templateNumber} onChange={(e) => setTemplateNumber(e.target.value as "1" | "2" | "3")}>
                <option value="1">1 - Classic</option>
                <option value="2">2 - Side-by-side</option>
                <option value="3">3 - Reversed (dark)</option>
              </select>
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
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Background</h2>
          <ColorField
            label="Outro background color"
            value={(config.outroBackgroundColor as string | null) ?? ""}
            onChange={(v) => setField("outroBackgroundColor", v || null)}
            placeholder="palette color"
          />
          <ColorField
            label="Outro circles color"
            value={(config.outroAccentColor as string | null) ?? ""}
            onChange={(v) => setField("outroAccentColor", v || null)}
            placeholder="palette color"
          />
          <div className="field">
            <label>Background image</label>
            <select
              value={(config.backgroundImage as string | null) ?? ""}
              onChange={(e) => setField("backgroundImage", e.target.value || null)}
            >
              <option value="">None - use the plain theme background color</option>
              <option value={RANDOM_BACKGROUND_IMAGE}>Random - a different image for each reel</option>
              {backgroundImages.map((img) => (
                <option key={img} value={img}>
                  {img.replace("background-images/", "")}
                </option>
              ))}
            </select>
          </div>
          {config.backgroundImage && (
            <>
              {isRandomBackground ? (
                <p className="hint" style={{ marginTop: 10 }}>
                  Each rendered reel picks one of the {backgroundImages.length} images in assets/background-images at random. The
                  preview shows one of them.
                </p>
              ) : (
                <img
                  src={`/${config.backgroundImage}`}
                  alt=""
                  style={{ marginTop: 10, width: "100%", maxWidth: 220, borderRadius: 8, display: "block" }}
                />
              )}
              <div className="field" style={{ marginTop: 14 }}>
                <label>Tint over the image (0 = fully clear/transparent, 1 = fully hides it)</label>
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={1}
                  value={(config.backgroundImageScrim as number) ?? 0.55}
                  onChange={(e) => setField("backgroundImageScrim", Number(e.target.value))}
                />
              </div>
            </>
          )}
        </div>

        <div className="card">
          <h2>Text colors</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            One color per text element. Leave a field empty to use the palette color below.
          </p>
          <div className="grid">
            {TEXT_COLOR_FIELDS.map((f) => (
              <ColorField
                key={f.key}
                label={`${f.scene} - ${f.label}`}
                value={config.textColors?.[f.key] ?? ""}
                onChange={(v) => setTextColor(f.key, v)}
                placeholder="palette color"
              />
            ))}
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
                Dark scenes (Template 3)
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
        {!savedId && <p className="hint">Save at least once before pushing - the JSON file is written on save.</p>}
      </form>

      <aside className="editor-preview">
        <div className="card preview-card">
          <h2>Live preview</h2>
          <p className="hint" style={{ marginTop: 0 }}>
            Shows the colors above on the selected composition, with sample text. Durations are approximate -
            this is for checking colors, not final timing.
          </p>
          {previewConfig ? (
            <ReelPreview templateNumber={templateNumber} config={previewConfig} />
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
