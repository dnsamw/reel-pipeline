import { useEffect, useState } from "react";
import { api } from "../api";
import { ColorField } from "../components/ReelConfigFields";
import { PostPreview } from "../components/PostPreview";
import { PostReelPanel } from "../components/PostReelPanel";
import { PublishPanel } from "../components/PublishPanel";
import { postCaptionContext, suggestPostCaption } from "../lib/postCaption";
import type { CaptionContext } from "../types";
import { PostTemplatePicker } from "../components/PostTemplatePicker";
import { PostFieldInput, PostListInput } from "../components/PostFieldInputs";
import { TemplatePicker } from "../components/TemplatePicker";
import { getPostTemplate, postTemplates } from "../../../src/posts/registry";
import type { PostColors, PostFields, PostListItem, PostLists } from "../../../src/posts/types";
import type { ReelTheme, TemplateRecord } from "../types";

const LAST_TEMPLATE_KEY = "studypal-reels:post-creator:last-template";
const GUIDES_KEY = "studypal-reels:post-creator:show-guides";
const draftKey = (templateId: string) => `studypal-reels:post-creator:draft:${templateId}`;

interface Draft {
  fields: PostFields;
  lists: PostLists;
  colors: PostColors;
  reelTemplateId: string;
  /** Keep content inside the Reels/Stories safe zones - on by default for 9:16 templates. */
  safeZones: boolean;
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
    lists: { ...def.defaultLists, ...saved?.lists },
    colors: { ...def.defaultColors, ...saved?.colors },
    reelTemplateId: saved?.reelTemplateId ?? "",
    variant: saved?.variant ?? "light",
    safeZones: saved?.safeZones ?? def.width * 16 === def.height * 9,
  };
}

export function PostCreator() {
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const def = getPostTemplate(templateId)!;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(templateId));
  const [showGuides, setShowGuides] = useState(() => readStorage<boolean>(GUIDES_KEY) ?? false);
  const [paletteSource, setPaletteSource] = useState<"template" | "reel">("template");

  const [reelTemplates, setReelTemplates] = useState<TemplateRecord[]>([]);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lastExport, setLastExport] = useState<{ url: string; savedPath: string; filename: string; snapshot: string; caption: string; context: CaptionContext } | null>(null);

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

  function toggleGuides(on: boolean) {
    setShowGuides(on);
    writeStorage(GUIDES_KEY, on);
  }

  function switchTemplate(id: string) {
    writeStorage(LAST_TEMPLATE_KEY, id);
    setTemplateId(id);
    setDraft(loadDraft(id));
  }

  function setField(key: string, value: string) {
    setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));
  }

  function setList(key: string, items: PostListItem[]) {
    setDraft((d) => ({ ...d, lists: { ...d.lists, [key]: items } }));
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
    setDraft((d) => ({ ...d, fields: { ...def.defaultFields }, lists: { ...def.defaultLists } }));
  }

  // What an export was made from - compared later to warn that publishing
  // would post an out-of-date file.
  const contentSnapshot = JSON.stringify({ templateId, fields: draft.fields, lists: draft.lists, colors: draft.colors, safeZones: draft.safeZones });

  async function onExport() {
    setError(null);
    setExporting(true);
    try {
      const { blob, savedPath } = await api.renderPost({ templateId, fields: draft.fields, lists: draft.lists, colors: draft.colors, safeZones: draft.safeZones });
      const url = URL.createObjectURL(blob);
      const filename = savedPath.split("/").pop() || `${templateId}.png`;
      setLastExport({ url, savedPath, filename, snapshot: contentSnapshot, caption: suggestPostCaption(def, draft.fields, draft.lists), context: postCaptionContext(def, draft.fields, draft.lists, "image") });
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
              {def.fields.map((f) =>
                f.type === "list" ? (
                  <PostListInput key={`${templateId}-${f.key}`} def={f} items={draft.lists[f.key] ?? []} onChange={(items) => setList(f.key, items)} />
                ) : (
                  <PostFieldInput key={`${templateId}-${f.key}`} def={f} value={draft.fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)} onError={setError} stock />
                ),
              )}
            </div>
          </div>

          {def.suggestCaption && <CaptionCard caption={def.suggestCaption(draft.fields, draft.lists)} />}

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

          {lastExport && (
            <div className="card">
              <h2>Image post</h2>
              <div className="post-export-result">
                <img src={lastExport.url} alt="Exported post" />
                <p className="hint saved-path">Saved to {lastExport.savedPath}</p>
              </div>
              <PublishPanel
                source={{ type: "post", savedPath: lastExport.savedPath }}
                fallbackCaption={lastExport.caption}
                captionContext={lastExport.context}
                kind="image"
                stale={lastExport.snapshot !== contentSnapshot}
                previewUrl={lastExport.url}
              />
            </div>
          )}

          <PostReelPanel def={def} fields={draft.fields} lists={draft.lists} colors={draft.colors} safeZones={draft.safeZones} onError={setError} />
        </div>

        <div className="editor-preview post-creator-preview">
          <div className="card preview-card">
            <h2>Preview</h2>
            {/* Tall formats (stories) are capped by viewport height, not just column width */}
            <div style={{ width: `min(100%, calc(72vh * ${def.width / def.height}))`, margin: "0 auto" }}>
              <PostPreview def={def} fields={draft.fields} lists={draft.lists} colors={draft.colors} safeZones={draft.safeZones} showGuides={showGuides} />
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {def.width}×{def.height} PNG
            </p>
            <div className="field checkbox">
              <input
                id="post-safe-zones"
                type="checkbox"
                checked={draft.safeZones}
                onChange={(e) => setDraft((d) => ({ ...d, safeZones: e.target.checked }))}
              />
              <label htmlFor="post-safe-zones">Keep content inside Reels safe zones</label>
            </div>
            <div className="field checkbox" style={{ marginTop: 6 }}>
              <input id="post-show-guides" type="checkbox" checked={showGuides} onChange={(e) => toggleGuides(e.target.checked)} />
              <label htmlFor="post-show-guides">Show safe-zone guides</label>
            </div>
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
            {lastExport && <p className="hint saved-path">Saved to {lastExport.savedPath}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The template's caption, live from the fields, to copy into Facebook by hand (the publish panel only appears after an export). */
function CaptionCard({ caption }: { caption: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card">
      <div className="card-heading-row">
        <h2>Caption</h2>
        <button
          type="button"
          className="secondary small"
          onClick={() =>
            navigator.clipboard.writeText(caption).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? "Copied" : "Copy caption"}
        </button>
      </div>
      <textarea readOnly rows={14} lang="si" value={caption} style={{ width: "100%" }} />
      <span className="hint">Paste it into the post, then replace the [[ POST CONTENT ]] line with your phrase list. Facebook allows about 63,000 characters.</span>
    </div>
  );
}
