import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { ColorField } from "../components/ReelConfigFields";
import { PostPreview } from "../components/PostPreview";
import { PostTemplatePicker } from "../components/PostTemplatePicker";
import { TemplatePicker } from "../components/TemplatePicker";
import { getPostTemplate, postTemplates } from "../../../src/posts/registry";
import type { PostColors, PostFieldDef, PostFields } from "../../../src/posts/types";
import type { ReelTheme, TemplateRecord } from "../types";

const LAST_TEMPLATE_KEY = "studypal-reels:post-creator:last-template";
const draftKey = (templateId: string) => `studypal-reels:post-creator:draft:${templateId}`;

interface Draft {
  fields: PostFields;
  colors: PostColors;
  reelTemplateId: string;
  variant: "light" | "dark";
}

// Per-viewer convenience only (your in-progress post survives a reload) -
// every read/write tolerates storage being unavailable.
function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    // ignore
  }
}

function initialTemplateId(): string {
  try {
    const last = localStorage.getItem(LAST_TEMPLATE_KEY);
    if (last && getPostTemplate(last)) return last;
  } catch {
    // ignore
  }
  return postTemplates[0].id;
}

function loadDraft(templateId: string): Draft {
  const def = getPostTemplate(templateId)!;
  const saved = readStorage<Partial<Draft>>(draftKey(templateId));
  return {
    fields: { ...def.defaultFields, ...saved?.fields },
    colors: { ...def.defaultColors, ...saved?.colors },
    reelTemplateId: saved?.reelTemplateId ?? "",
    variant: saved?.variant ?? "light",
  };
}

export function PostCreator() {
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const def = getPostTemplate(templateId)!;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(templateId));
  const [paletteSource, setPaletteSource] = useState<"template" | "reel">("template");

  const [reelTemplates, setReelTemplates] = useState<TemplateRecord[]>([]);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ url: string; savedPath: string; filename: string } | null>(null);

  useEffect(() => {
    api.templates().then(setReelTemplates).catch(() => {});
    api.defaultTheme().then(setDefaultTheme).catch(() => {});
    // Start the server's Remotion bundle now, so Export doesn't wait on it.
    api.warmPostRenderer().catch(() => {});
  }, []);

  useEffect(() => {
    writeStorage(draftKey(templateId), draft);
  }, [templateId, draft]);

  useEffect(() => () => {
    if (lastExport) URL.revokeObjectURL(lastExport.url);
  }, [lastExport]);

  function switchTemplate(id: string) {
    writeStorage(LAST_TEMPLATE_KEY, id);
    setTemplateId(id);
    setDraft(loadDraft(id));
  }

  function setField(key: string, value: string) {
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));
  }

  function setColor(key: string, value: string) {
    setDraft((d) => ({ ...d, colors: { ...d.colors, [key]: value } }));
  }

  function themeFor(reelTemplateId: string): ReelTheme | null {
    const t = reelTemplates.find((r) => r.id === reelTemplateId);
    return t?.config.theme ?? defaultTheme;
  }

  /** Overwrites the current colors with the chosen reel template's palette, mapped through this post template's colorsFromPalette. */
  function applyReelPalette(reelTemplateId: string, variant: "light" | "dark") {
    const theme = themeFor(reelTemplateId);
    if (!theme) return;
    setDraft((d) => ({
      ...d,
      reelTemplateId,
      variant,
      colors: { ...def.defaultColors, ...def.colorsFromPalette(theme[variant], variant) },
    }));
    setPaletteSource("reel");
  }

  function resetColors() {
    setDraft((d) => ({ ...d, colors: { ...def.defaultColors } }));
    setPaletteSource("template");
  }

  function resetContent() {
    setDraft((d) => ({ ...d, fields: { ...def.defaultFields } }));
  }

  async function onExport() {
    setError(null);
    setExporting(true);
    try {
      const { blob, savedPath } = await api.renderPost({ templateId, fields: draft.fields, colors: draft.colors });
      const url = URL.createObjectURL(blob);
      const filename = savedPath.split("/").pop() || `${templateId}.png`;
      setLastExport({ url, savedPath, filename });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h1>Post Creator</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="editor-layout">
        <div className="editor-form">
          <div className="card">
            <h2>Template</h2>
            <PostTemplatePicker templates={postTemplates} value={templateId} onChange={switchTemplate} />
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Content</h2>
              <button type="button" className="secondary small" onClick={resetContent}>
                Reset content
              </button>
            </div>
            <div className="grid">
              {def.fields.map((f) => (
                <PostFieldInput key={`${templateId}-${f.key}`} def={f} value={draft.fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)} onError={setError} />
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Colors</h2>
              <button type="button" className="secondary small" onClick={resetColors}>
                Reset to template colors
              </button>
            </div>

            <div className="grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Use colors from a reel template</label>
                <TemplatePicker
                  templates={reelTemplates}
                  value={draft.reelTemplateId}
                  onChange={(id) => applyReelPalette(id, draft.variant)}
                  defaultTheme={defaultTheme}
                  noneLabel="Default brand palette"
                />
              </div>
              <div className="field">
                <label>Palette</label>
                <div className="segmented">
                  {(["light", "dark"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      className={draft.variant === v && paletteSource === "reel" ? "active" : ""}
                      onClick={() => applyReelPalette(draft.reelTemplateId, v)}
                    >
                      {v === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </div>
                <span className="hint">Picking a template or palette replaces the colors below - tweak them afterwards.</span>
              </div>
            </div>

            <div className="grid">
              {def.colors.map((c) => (
                <ColorField key={`${templateId}-${c.key}`} label={c.label} value={draft.colors[c.key] ?? ""} onChange={(v) => setColor(c.key, v)} />
              ))}
            </div>
          </div>
        </div>

        <div className="editor-preview post-creator-preview">
          <div className="card preview-card">
            <h2>Preview</h2>
            <PostPreview def={def} fields={draft.fields} colors={draft.colors} />
            <p className="hint" style={{ marginTop: 8 }}>
              {def.width}×{def.height} PNG
            </p>
            <div className="button-row">
              <button type="button" onClick={onExport} disabled={exporting}>
                {exporting ? "Rendering…" : "Export PNG"}
              </button>
              {lastExport && (
                <a href={lastExport.url} download={lastExport.filename}>
                  <button type="button" className="secondary">
                    Download again
                  </button>
                </a>
              )}
            </div>
            {lastExport && <p className="hint">Saved to {lastExport.savedPath}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PostFieldInput({
  def,
  value,
  onChange,
  onError,
}: {
  def: PostFieldDef;
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { path } = await api.uploadImage(file);
      onChange(path);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>{def.label}</label>
      {def.type === "textarea" && <textarea rows={2} lang={def.lang} value={value} onChange={(e) => onChange(e.target.value)} />}
      {def.type === "text" && <input type="text" lang={def.lang} value={value} onChange={(e) => onChange(e.target.value)} />}
      {def.type === "image" && (
        <div className="post-image-field">
          <input type="text" value={value} placeholder="images/… path or https:// URL" onChange={(e) => onChange(e.target.value)} />
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="button" className="secondary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {value && (
            <button type="button" className="secondary" onClick={() => onChange("")}>
              Clear
            </button>
          )}
        </div>
      )}
      {def.hint && <span className="hint">{def.hint}</span>}
    </div>
  );
}
