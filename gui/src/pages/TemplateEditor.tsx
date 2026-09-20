import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { ReelPreview } from "../components/ReelPreview";
import type { Palette, ReelConfig, ReelTheme, TemplateRecord } from "../types";

type ConfigOverrides = Partial<ReelConfig>;

const NUMBER_FIELDS: { key: keyof ReelConfig; label: string; step?: number; min?: number; max?: number }[] = [
  { key: "phrasesPerReel", label: "Phrases per reel", step: 1, min: 1, max: 6 },
  { key: "introSeconds", label: "Intro seconds", step: 0.5, min: 0, max: 10 },
  { key: "phraseSeconds", label: "Phrase seconds", step: 0.5, min: 0.5, max: 12 },
  { key: "countdownSeconds", label: "Countdown seconds", step: 1, min: 1, max: 15 },
  { key: "revealSeconds", label: "Reveal seconds", step: 0.5, min: 0.5, max: 12 },
  { key: "outroSeconds", label: "Outro seconds", step: 0.5, min: 0.5, max: 10 },
  { key: "transitionSeconds", label: "Transition seconds", step: 0.1, min: 0, max: 3 },
  { key: "ttsRate", label: "TTS speed (1 = normal)", step: 0.05, min: 0.5, max: 2 },
  { key: "musicVolume", label: "Music volume", step: 0.05, min: 0, max: 1 },
  { key: "tickVolume", label: "Tick volume", step: 0.05, min: 0, max: 1 },
  { key: "revealSoundVolume", label: "Reveal sound volume", step: 0.05, min: 0, max: 1 },
  { key: "introVoiceVolume", label: "Intro voice volume", step: 0.05, min: 0, max: 1 },
  { key: "phraseVoiceVolume", label: "Phrase voice volume", step: 0.05, min: 0, max: 1 },
  { key: "revealVoiceVolume", label: "Reveal voice volume", step: 0.05, min: 0, max: 1 },
];

function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

// A real <input type="text"> is the primary control here, not <input
// type="color"> - typing into that native color swatch's hex sub-field
// works, but pasting into it doesn't reliably register in Chromium (the
// paste event isn't forwarded to that shadow-DOM field the way it is for a
// normal text input). The swatch stays as a secondary visual-picker button.
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="color-input-row">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#58238b"
          spellCheck={false}
          className="color-hex-input"
        />
        <input
          type="color"
          value={isValidHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          title="Pick visually"
          className="color-swatch-input"
        />
      </div>
    </div>
  );
}

const PALETTE_FIELDS: { key: keyof Palette; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "brand2", label: "Brand 2" },
  { key: "gold", label: "Gold" },
  { key: "goldInk", label: "Gold ink (text on gold)" },
  { key: "foreground", label: "Foreground (text)" },
  { key: "mutedForeground", label: "Muted text" },
  { key: "border", label: "Border" },
  { key: "background", label: "Background" },
];

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

  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id ?? null);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

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
          <div className="grid">
            {NUMBER_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input
                  type="number"
                  step={f.step}
                  min={f.min}
                  max={f.max}
                  value={(config[f.key] as number | undefined) ?? ""}
                  onChange={(e) => setField(f.key, (e.target.value === "" ? undefined : Number(e.target.value)) as never)}
                />
              </div>
            ))}
          </div>
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
          <h2>Colors</h2>
          <div className="field checkbox" style={{ marginBottom: 14 }}>
            <input id="theme-enabled" type="checkbox" checked={themeEnabled} onChange={(e) => setThemeEnabled(e.target.checked)} />
            <label htmlFor="theme-enabled">Override the brand palette for this template</label>
          </div>
          {themeEnabled && lightPalette && darkPalette && (
            <>
              <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em" }}>Light scenes</h2>
              <div className="grid">
                {PALETTE_FIELDS.map((f) => (
                  <ColorField
                    key={`light-${f.key}`}
                    label={f.label}
                    value={lightPalette[f.key]}
                    onChange={(v) => setPaletteField("light", f.key, v)}
                  />
                ))}
              </div>
              <h2 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 18 }}>
                Dark scenes (Template 3)
              </h2>
              <div className="grid">
                {PALETTE_FIELDS.map((f) => (
                  <ColorField
                    key={`dark-${f.key}`}
                    label={f.label}
                    value={darkPalette[f.key]}
                    onChange={(v) => setPaletteField("dark", f.key, v)}
                  />
                ))}
              </div>
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
