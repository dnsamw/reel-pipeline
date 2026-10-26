import { useEffect, useState, type ReactNode } from "react";
import { api } from "../api";
import { ColorField } from "../components/ReelConfigFields";
import { PostPreview } from "../components/PostPreview";
import { DrawingOverlay, DrawingToolbar } from "../components/DrawingPad";
import { PostReelPanel } from "../components/PostReelPanel";
import { PublishPanel } from "../components/PublishPanel";
import { postCaptionContext, suggestPostCaption } from "../lib/postCaption";
import type { CaptionContext } from "../types";
import { PostTemplatePicker } from "../components/PostTemplatePicker";
import { PostFieldInput, PostListInput } from "../components/PostFieldInputs";
import { TemplatePicker } from "../components/TemplatePicker";
import { getPostTemplate, postTemplates } from "../../../src/posts/registry";
import { contactBrandColors, contactDefaults, contactOldDefaultColors } from "../../../src/posts/ContactBadge";
import type { PostColors, PostFields, PostListItem, PostLists, PostScalarFieldDef, PostTemplateDef } from "../../../src/posts/types";
import type { ReelTheme, TemplateRecord } from "../types";

const GUIDES_KEY = "studypal-reels:post-creator:show-guides";
/**
 * The mobile number on posts: the number, text and colors are one setting for
 * every post page (Post Creator, Vocab Post, Sentence Post); position and size
 * are kept per page (`${storagePrefix}:contact-layout`), since each page's
 * templates have their logo and title in different places.
 */
const CONTACT_KEY = "studypal-reels:post-contact";
const CONTACT_LAYOUT_KEYS = ["contactX", "contactY", "contactSize"];

const pick = (f: PostFields, keys: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => keys.includes(k)));
const omit = (f: PostFields, keys: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !keys.includes(k)));

/** Saved contact settings, with colors still on the first (pre-brand) defaults moved to the brand colors - colors you picked yourself are kept. */
function loadContactShared(): PostFields {
  const saved = omit(readStorage<PostFields>(CONTACT_KEY) ?? {}, CONTACT_LAYOUT_KEYS);
  const untouched = Object.keys(contactOldDefaultColors).every((k) => saved[k] === undefined || saved[k].toUpperCase() === contactOldDefaultColors[k].toUpperCase());
  return untouched ? omit(saved, Object.keys(contactBrandColors)) : saved;
}

const CONTACT_FIELDS: PostScalarFieldDef[] = [
  { key: "contactPhone", label: "Mobile number", type: "text", hint: "Shown on every post and its reel, on all post pages. Empty hides it." },
  { key: "contactLabel", label: "Text before the number", type: "text", hint: "e.g. WhatsApp or Call. Empty = the number only." },
  { key: "contactSize", label: "Size", type: "range", min: 20, max: 90, unit: "px", hint: "Size and position are remembered separately on each post page." },
  { key: "contactX", label: "Position - left / right", type: "range", min: 0, max: 100, unit: "%", hint: "0 = left, 50 = center, 100 = right." },
  { key: "contactY", label: "Position - up / down", type: "range", min: 0, max: 100, unit: "%", hint: "0 = top edge, 100 = bottom edge of the post. Turn on \"Show safe-zone guides\" to see where the Reels caption and buttons cover it." },
  { key: "contactBgOpacity", label: "Background opacity", type: "range", min: 0, max: 100, unit: "%", hint: "0 = no box - just the icon and text on the image, like the StudyPal logo." },
];

const CONTACT_COLORS = [
  { key: "contactBg", label: "Background" },
  { key: "contactIconBg", label: "Icon bubble" },
  { key: "contactIconInk", label: "Icon phone" },
  { key: "contactLabelColor", label: "Text before the number" },
  { key: "contactText", label: "Number" },
];

export interface Draft {
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

function initialTemplateId(templates: PostTemplateDef[], lastKey: string): string {
  try {
    const last = localStorage.getItem(lastKey);
    if (last && templates.some((t) => t.id === last)) return last;
  } catch {
    // ignore
  }
  return templates[0].id;
}

function loadDraft(templateId: string, key: string): Draft {
  const def = getPostTemplate(templateId)!;
  const saved = readStorage<Partial<Draft>>(key);
  return {
    fields: { ...def.defaultFields, ...saved?.fields },
    lists: { ...def.defaultLists, ...saved?.lists },
    colors: { ...def.defaultColors, ...saved?.colors },
    reelTemplateId: saved?.reelTemplateId ?? "",
    variant: saved?.variant ?? "light",
    safeZones: saved?.safeZones ?? def.width * 16 === def.height * 9,
  };
}

export interface PostCreatorProps {
  title?: string;
  templates?: PostTemplateDef[];
  /** localStorage namespace for the last template + drafts - separate pages keep separate drafts. */
  storagePrefix?: string;
  templateHeading?: string;
  /**
   * One draft shared by every template (they must share field keys) - so
   * switching template (e.g. Vocab Post's size) keeps the content. Default:
   * one draft per template.
   */
  sharedDraft?: boolean;
  /** Extra controls at the top of the Content card (e.g. Vocab Post's AI generator). */
  contentExtras?: (draft: Draft, setDraft: (update: (d: Draft) => Draft) => void, onError: (message: string | null) => void) => ReactNode;
  /** A field holding pencil strokes (src/posts/Drawing.tsx) - adds a Paint-style pencil over the preview. The template must draw them. */
  drawField?: string;
}

export function PostCreator({
  title = "Post Creator",
  templates = postTemplates,
  storagePrefix = "studypal-reels:post-creator",
  templateHeading = "Template",
  sharedDraft = false,
  contentExtras,
  drawField,
}: PostCreatorProps = {}) {
  const lastTemplateKey = `${storagePrefix}:last-template`;
  const draftKey = (id: string) => (sharedDraft ? `${storagePrefix}:draft` : `${storagePrefix}:draft:${id}`);
  const [templateId, setTemplateId] = useState(() => initialTemplateId(templates, lastTemplateKey));
  const def = getPostTemplate(templateId)!;
  const [draft, setDraft] = useState<Draft>(() => loadDraft(templateId, draftKey(templateId)));
  const [showGuides, setShowGuides] = useState(() => readStorage<boolean>(GUIDES_KEY) ?? false);
  const [paletteSource, setPaletteSource] = useState<"template" | "reel">("template");
  const [drawing, setDrawing] = useState(false);
  const [penColor, setPenColor] = useState("#FF2D2D");
  const [penSize, setPenSize] = useState(8);
  const contactLayoutKey = `${storagePrefix}:contact-layout`;
  const [contact, setContact] = useState<PostFields>(() => ({
    ...contactDefaults,
    ...loadContactShared(),
    ...readStorage<PostFields>(contactLayoutKey),
  }));
  // What gets rendered: the post's own fields plus the shared mobile number.
  const fields = { ...draft.fields, ...contact };

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

  useEffect(() => {
    writeStorage(CONTACT_KEY, omit(contact, CONTACT_LAYOUT_KEYS));
    writeStorage(contactLayoutKey, pick(contact, CONTACT_LAYOUT_KEYS));
  }, [contact]);

  useEffect(() => () => {
    if (lastExport) URL.revokeObjectURL(lastExport.url);
  }, [lastExport]);

  function toggleGuides(on: boolean) {
    setShowGuides(on);
    writeStorage(GUIDES_KEY, on);
  }

  function switchTemplate(id: string) {
    writeStorage(lastTemplateKey, id);
    setTemplateId(id);
    // Shared draft: keep what's being edited, but re-apply the new size's safe-zone default.
    if (sharedDraft) {
      const next = getPostTemplate(id)!;
      setDraft((d) => ({ ...d, safeZones: next.width * 16 === next.height * 9 }));
    } else {
      setDraft(loadDraft(id, draftKey(id)));
    }
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
  const contentSnapshot = JSON.stringify({ templateId, fields, lists: draft.lists, colors: draft.colors, safeZones: draft.safeZones });

  async function onExport() {
    setError(null);
    setExporting(true);
    try {
      const { blob, savedPath } = await api.renderPost({ templateId, fields, lists: draft.lists, colors: draft.colors, safeZones: draft.safeZones });
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
      <h1>{title}</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="editor-layout">
        <div className="editor-form">
          <div className="card">
            <h2>{templateHeading}</h2>
            <PostTemplatePicker templates={templates} value={templateId} onChange={switchTemplate} />
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Content</h2>
              <button type="button" className="secondary small" onClick={resetContent}>
                Reset content
              </button>
            </div>
            {contentExtras?.(draft, setDraft, setError)}
            <div className="grid">
              {def.fields.map((f) =>
                f.type === "list" ? (
                  <PostListInput key={`${templateId}-${f.key}`} def={f} items={draft.lists[f.key] ?? []} onChange={(items) => setList(f.key, items)} onError={setError} />
                ) : (
                  <PostFieldInput key={`${templateId}-${f.key}`} def={f} value={draft.fields[f.key] ?? ""} onChange={(v) => setField(f.key, v)} onError={setError} stock />
                ),
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Mobile number</h2>
              <button type="button" className="secondary small" onClick={() => setContact((c) => ({ ...c, ...contactBrandColors }))}>
                Reset to brand colors
              </button>
            </div>
            <div className="grid">
              {CONTACT_FIELDS.map((f) => (
                <PostFieldInput key={f.key} def={f} value={contact[f.key] ?? ""} onChange={(v) => setContact((c) => ({ ...c, [f.key]: v }))} onError={setError} />
              ))}
              {CONTACT_COLORS.map((c) => (
                <ColorField key={c.key} label={c.label} value={contact[c.key] ?? ""} onChange={(v) => setContact((cur) => ({ ...cur, [c.key]: v }))} />
              ))}
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

          <PostReelPanel def={def} fields={fields} lists={draft.lists} colors={draft.colors} safeZones={draft.safeZones} onError={setError} />
        </div>

        <div className="editor-preview post-creator-preview">
          <div className="card preview-card">
            <h2>Preview</h2>
            {drawField && (
              <DrawingToolbar
                value={draft.fields[drawField] ?? ""}
                onChange={(v) => setField(drawField, v)}
                active={drawing}
                onActiveChange={setDrawing}
                color={penColor}
                onColorChange={setPenColor}
                size={penSize}
                onSizeChange={setPenSize}
              />
            )}
            {/* Tall formats (stories) are capped by viewport height, not just column width */}
            <div style={{ position: "relative", width: `min(100%, calc(72vh * ${def.width / def.height}))`, margin: "0 auto" }}>
              <PostPreview def={def} fields={fields} lists={draft.lists} colors={draft.colors} safeZones={draft.safeZones} showGuides={showGuides} />
              {drawField && (
                <DrawingOverlay
                  width={def.width}
                  height={def.height}
                  value={draft.fields[drawField] ?? ""}
                  onChange={(v) => setField(drawField, v)}
                  active={drawing}
                  color={penColor}
                  size={penSize}
                />
              )}
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
