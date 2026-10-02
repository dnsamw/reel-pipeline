import { useEffect, useState } from "react";
import { Copy } from "lucide-react";
import { api, type AdRenderBody } from "../api";
import { AdPreview } from "../components/AdPreview";
import { AdTemplatePicker } from "../components/AdTemplatePicker";
import { PostFieldInput, PostListInput } from "../components/PostFieldInputs";
import { StillReelPanel } from "../components/PostReelPanel";
import { ColorField } from "../components/ReelConfigFields";
import { adTemplates, getAdTemplate } from "../../../src/ads/registry";
import { getProduct, productsOfKind } from "../../../src/ads/products";
import { HEADLINE_MAX, suggestHeadline, suggestPrimaryText } from "../../../src/ads/adCopy";
import {
  AD_FORMAT_ORDER,
  AD_FORMATS,
  DEFAULT_MOCKUP_ADJUST,
  adFileBase,
  resolveAdColors,
  resolveAdFields,
  type AdFormat,
  type AdMockupAdjust,
  type AdTemplateDef,
} from "../../../src/ads/types";
import type { PostFields, PostListItem, PostLists } from "../../../src/posts/types";

const LAST_TEMPLATE_KEY = "studypal-reels:ad-creator:last-template";
const FORMAT_KEY = "studypal-reels:ad-creator:format";
const GUIDES_KEY = "studypal-reels:ad-creator:show-guides";
const lastProductKey = (templateId: string) => `studypal-reels:ad-creator:last-product:${templateId}`;
const draftKey = (templateId: string, product: string) => `studypal-reels:ad-creator:draft:${templateId}:${product}`;

/** One ad = one template × one product; each remembers its own content, so switching book doesn't carry Book 4's hook onto Book 2. */
interface AdDraft {
  fields: PostFields;
  lists: PostLists;
  /** Overrides only - empty means the product's own color. */
  colors: Record<string, string>;
  mockup: AdMockupAdjust;
  variant: string;
  /** Ads Manager copy - undefined = the suggestion. */
  headline?: string;
  primaryText?: string;
}

// Per-viewer convenience only (in-progress ads survive a reload) - every
// read/write tolerates storage being unavailable.
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

function loadDraft(def: AdTemplateDef, product: string): AdDraft {
  const saved = readStorage<Partial<AdDraft>>(draftKey(def.id, product));
  return {
    fields: { ...def.defaultFields, ...saved?.fields },
    lists: { ...def.defaultLists, ...saved?.lists },
    colors: { ...saved?.colors },
    mockup: { ...DEFAULT_MOCKUP_ADJUST, ...saved?.mockup },
    variant: saved?.variant ?? "v1",
    headline: saved?.headline,
    primaryText: saved?.primaryText,
  };
}

function initialTemplate(): AdTemplateDef {
  const last = readStorage<string>(LAST_TEMPLATE_KEY);
  return (last && getAdTemplate(last)) || adTemplates[0];
}

function initialProduct(def: AdTemplateDef): string {
  const last = readStorage<string>(lastProductKey(def.id));
  return getProduct(def.productKind, last ?? def.defaultProduct).code;
}

function initialFormat(): AdFormat {
  const saved = readStorage<string>(FORMAT_KEY);
  return saved === "SQ" || saved === "PT" || saved === "ST" ? saved : "PT";
}

function renderBody(def: AdTemplateDef, product: string, format: AdFormat, d: AdDraft): AdRenderBody {
  return { templateId: def.id, format, product, fields: d.fields, lists: d.lists, colors: d.colors, mockup: d.mockup, variant: d.variant };
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
}

const fileName = (savedPath: string) => savedPath.split("/").pop() ?? savedPath;
/** output/ads/x.png -> /media/ads/x.png (Express serves output/ at /media). */
const mediaUrl = (savedPath: string) => `/media/${savedPath.replace(/^output\//, "")}`;

type BatchRow = { label: string; status: "pending" | "running" | "done" | "error"; savedPath?: string; error?: string };

export function AdCreator() {
  const [def, setDef] = useState(initialTemplate);
  const [product, setProduct] = useState(() => initialProduct(def));
  const [draft, setDraft] = useState<AdDraft>(() => loadDraft(def, product));
  const [preferredFormat, setPreferredFormat] = useState(initialFormat);
  const [showGuides, setShowGuides] = useState(() => readStorage<boolean>(GUIDES_KEY) ?? false);

  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<false | "one" | "all">(false);
  const [lastExport, setLastExport] = useState<{ url: string; savedPath: string } | null>(null);
  const [allFormats, setAllFormats] = useState<{ format: AdFormat; savedPath: string }[]>([]);

  const format: AdFormat = def.formats.includes(preferredFormat) ? preferredFormat : def.formats[0];
  const p = getProduct(def.productKind, product);
  const resolvedFields = resolveAdFields(def, p, draft.fields);
  const resolvedColors = resolveAdColors(def, p, draft.colors);
  const formats = AD_FORMAT_ORDER.filter((f) => def.formats.includes(f));

  useEffect(() => {
    // Ads render through the same Remotion bundle as posts - start it now so Export doesn't wait.
    api.warmPostRenderer().catch(() => {});
  }, []);

  useEffect(() => {
    writeStorage(draftKey(def.id, product), draft);
  }, [def.id, product, draft]);

  useEffect(() => () => {
    if (lastExport) URL.revokeObjectURL(lastExport.url);
  }, [lastExport]);

  function switchTemplate(id: string) {
    const next = getAdTemplate(id);
    if (!next) return;
    const nextProduct = initialProduct(next);
    writeStorage(LAST_TEMPLATE_KEY, id);
    setDef(next);
    setProduct(nextProduct);
    setDraft(loadDraft(next, nextProduct));
    setAllFormats([]);
  }

  function switchProduct(code: string) {
    writeStorage(lastProductKey(def.id), code);
    setProduct(code);
    setDraft(loadDraft(def, code));
    setAllFormats([]);
  }

  function switchFormat(f: AdFormat) {
    setPreferredFormat(f);
    writeStorage(FORMAT_KEY, f);
  }

  const patch = (d: Partial<AdDraft>) => setDraft((cur) => ({ ...cur, ...d }));
  const setField = (key: string, value: string) => setDraft((d) => ({ ...d, fields: { ...d.fields, [key]: value } }));
  const setList = (key: string, items: PostListItem[]) => setDraft((d) => ({ ...d, lists: { ...d.lists, [key]: items } }));
  const setMockup = (key: keyof AdMockupAdjust, value: number) => setDraft((d) => ({ ...d, mockup: { ...d.mockup, [key]: value } }));

  async function exportOne() {
    setError(null);
    setExporting("one");
    try {
      const { blob, savedPath } = await api.renderAd(renderBody(def, product, format, draft));
      const url = URL.createObjectURL(blob);
      setLastExport({ url, savedPath });
      download(url, fileName(savedPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  async function exportAllFormats() {
    setError(null);
    setExporting("all");
    setAllFormats([]);
    try {
      for (const f of formats) {
        const { savedPath } = await api.renderAd(renderBody(def, product, f, draft));
        setAllFormats((cur) => [...cur, { format: f, savedPath }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  const copySuggestion = suggestPrimaryText(p, resolvedFields, draft.lists);
  const headline = draft.headline ?? suggestHeadline(p);
  const primaryText = draft.primaryText ?? copySuggestion;
  const hasImageField = def.fields.some((f) => f.type === "image");

  return (
    <div>
      <h1>Ad Creator</h1>
      <p className="hint" style={{ marginTop: -8 }}>
        Facebook / Instagram ad images and videos from the ads plan's templates. Exports are named {"{TEMPLATE}_{PRODUCT}_{FORMAT}_{VARIANT}"} and saved to output/ads/.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="editor-layout">
        <div className="editor-form">
          <div className="card">
            <h2>Template</h2>
            <AdTemplatePicker templates={adTemplates} value={def.id} onChange={switchTemplate} />
            <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
              <span className="badge queued">{def.funnel}</span> {def.description}
            </p>
          </div>

          <div className="card">
            <h2>Product</h2>
            {def.productKind === "collection" ? (
              <p className="hint" style={{ margin: 0 }}>
                The complete collection (all 10 books) - product code ALL.
              </p>
            ) : (
              <div className="field">
                <label>{def.productKind === "book" ? "Book" : "Pack"}</label>
                <select value={product} onChange={(e) => switchProduct(e.target.value)}>
                  {productsOfKind(def.productKind).map((x) => (
                    <option key={x.code} value={x.code}>
                      {x.code} · {x.label}
                    </option>
                  ))}
                </select>
                <span className="hint">
                  Each {def.productKind} keeps its own content, colors and mockup.
                  {p.kind === "book" && p.book.n === 8 && " Book 8 ads belong in the separate 18+ campaign only (ads plan, Part 13)."}
                </span>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Content</h2>
              <button type="button" className="secondary small" onClick={() => patch({ fields: { ...def.defaultFields }, lists: { ...def.defaultLists } })}>
                Reset content
              </button>
            </div>
            <p className="hint" style={{ marginTop: 0 }}>
              Grey placeholder text is what the ad uses while a field is empty.
            </p>
            <div className="grid">
              {def.fields.map((f) =>
                f.type === "list" ? (
                  <PostListInput key={`${def.id}-${product}-${f.key}`} def={f} items={draft.lists[f.key] ?? []} onChange={(items) => setList(f.key, items)} />
                ) : (
                  <PostFieldInput
                    key={`${def.id}-${product}-${f.key}`}
                    def={f}
                    value={draft.fields[f.key] ?? ""}
                    placeholder={(f.auto ?? f.placeholder)?.(p, draft.fields) || undefined}
                    onChange={(v) => setField(f.key, v)}
                    onError={setError}
                  />
                ),
              )}
            </div>
          </div>

          {hasImageField && (
            <div className="card">
              <div className="card-heading-row">
                <h2>Mockup position</h2>
                <button type="button" className="secondary small" onClick={() => patch({ mockup: { ...DEFAULT_MOCKUP_ADJUST } })}>
                  Reset
                </button>
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                Nudges the uploaded mockup image inside its slot (not the cover fallback).
              </p>
              <div className="grid">
                <MockupSlider label="Scale" value={draft.mockup.scale} min={0.5} max={1.6} step={0.01} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => setMockup("scale", v)} />
                <MockupSlider label="Rotate" value={draft.mockup.rotate} min={-20} max={20} step={0.5} format={(v) => `${v}°`} onChange={(v) => setMockup("rotate", v)} />
                <MockupSlider label="Move X" value={draft.mockup.x} min={-300} max={300} step={2} format={(v) => `${v}px`} onChange={(v) => setMockup("x", v)} />
                <MockupSlider label="Move Y" value={draft.mockup.y} min={-300} max={300} step={2} format={(v) => `${v}px`} onChange={(v) => setMockup("y", v)} />
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-heading-row">
              <h2>Colors</h2>
              <button type="button" className="secondary small" onClick={() => patch({ colors: {} })}>
                Reset to {def.productKind === "book" ? "book" : "brand"} colors
              </button>
            </div>
            <div className="grid">
              {def.colors.map((c) => (
                <ColorField key={`${def.id}-${product}-${c.key}`} label={c.label} value={draft.colors[c.key] || resolvedColors[c.key] || ""} onChange={(v) => patch({ colors: { ...draft.colors, [c.key]: v } })} />
              ))}
            </div>
            {def.productKind === "book" && (
              <p className="hint" style={{ marginBottom: 0 }}>
                Single-book ads use the book's own accent and tint (ads plan, Part 6.1). The price chip stays gold on every ad.
              </p>
            )}
          </div>

          <div className="card">
            <div className="card-heading-row">
              <h2>Ad copy (Ads Manager)</h2>
              <button type="button" className="secondary small" onClick={() => patch({ headline: undefined, primaryText: undefined })}>
                Reset to suggestion
              </button>
            </div>
            <div className="field">
              <label>
                Headline{" "}
                <span className={`hint${headline.length > HEADLINE_MAX ? " text-danger" : ""}`}>
                  {headline.length}/{HEADLINE_MAX}
                </span>
              </label>
              <div className="post-image-field">
                <input type="text" value={headline} onChange={(e) => patch({ headline: e.target.value })} />
                <CopyButton text={headline} />
              </div>
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label>Primary text</label>
              <textarea rows={8} lang="si" value={primaryText} onChange={(e) => patch({ primaryText: e.target.value })} />
              <div className="button-row" style={{ marginTop: 6 }}>
                <CopyButton text={primaryText} label="Copy primary text" />
              </div>
              <span className="hint">
                Built from the copy bank (Part 12). About 125 characters show before "See more". Sinhala lines are drafts - have a native speaker review them before the ad goes live.
              </span>
            </div>
          </div>

          <StillReelPanel
            width={AD_FORMATS[format].width}
            height={AD_FORMATS[format].height}
            settingsKey="studypal-reels:ad-creator:reel-settings"
            snapshot={JSON.stringify({ def: def.id, product, format, draft: { ...draft, headline: undefined, primaryText: undefined } })}
            fallbackFilename={`${adFileBase(def, product, format, draft.variant)}.mp4`}
            title="Video (MP4)"
            description={`This ad (${format}) as a still-image video with background music. Use ST for Reels and Stories placements.`}
            onError={setError}
            exportReel={async (reel) => ({ ...(await api.renderAdReel({ ...renderBody(def, product, format, draft), reel })), extra: undefined })}
          />

          <BatchExport def={def} currentProduct={product} currentDraft={draft} onError={setError} />
        </div>

        <div className="editor-preview post-creator-preview">
          <div className="card preview-card">
            <h2>Preview</h2>
            <div className="segmented" style={{ marginBottom: 12 }}>
              {formats.map((f) => (
                <button key={f} type="button" className={f === format ? "active" : ""} onClick={() => switchFormat(f)} title={AD_FORMATS[f].label}>
                  {f} · {AD_FORMATS[f].label.split(" ").pop()}
                </button>
              ))}
            </div>
            {/* Tall formats (stories) are capped by viewport height, not just column width */}
            <div style={{ width: `min(100%, calc(72vh * ${AD_FORMATS[format].width / AD_FORMATS[format].height}))`, margin: "0 auto" }}>
              <AdPreview def={def} format={format} product={product} fields={draft.fields} lists={draft.lists} colors={draft.colors} mockup={draft.mockup} showGuides={showGuides} />
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              {AD_FORMATS[format].width}×{AD_FORMATS[format].height} PNG{format === "ST" && " · content kept inside the Stories/Reels safe zones"}
            </p>
            <div className="field checkbox">
              <input
                id="ad-show-guides"
                type="checkbox"
                checked={showGuides}
                onChange={(e) => {
                  setShowGuides(e.target.checked);
                  writeStorage(GUIDES_KEY, e.target.checked);
                }}
              />
              <label htmlFor="ad-show-guides">Show Reels/Stories safe zones</label>
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Variant</label>
              <input type="text" value={draft.variant} onChange={(e) => patch({ variant: e.target.value })} style={{ maxWidth: 120 }} />
              <span className="hint">
                File: {adFileBase(def, product, format, draft.variant)}.png - exporting the same variant again replaces it.
              </span>
            </div>
            <div className="button-row">
              <button type="button" onClick={exportOne} disabled={!!exporting}>
                {exporting === "one" ? "Rendering…" : `Export ${format} PNG`}
              </button>
              <button type="button" className="secondary" onClick={exportAllFormats} disabled={!!exporting}>
                {exporting === "all" ? `Rendering ${allFormats.length + 1}/${formats.length}…` : "Export all formats"}
              </button>
            </div>
            {lastExport && (
              <p className="hint saved-path">
                Saved to {lastExport.savedPath} ·{" "}
                <a href={lastExport.url} download={fileName(lastExport.savedPath)}>
                  download again
                </a>
              </p>
            )}
            {allFormats.length > 0 && (
              <ul className="ad-results">
                {allFormats.map((r) => (
                  <li key={r.format}>
                    <a href={mediaUrl(r.savedPath)} download={fileName(r.savedPath)}>
                      {fileName(r.savedPath)}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function MockupSlider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div className="field">
      <label>
        {label} · {format(value)}
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(label === "Scale" ? 1 : 0)} />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="secondary"
      title="Copy to clipboard"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
    >
      <Copy size={14} /> {copied ? "Copied" : (label ?? "Copy")}
    </button>
  );
}

/**
 * The ads plan's batch output (Part 10.3): one template across several
 * products and formats in one go. Each product renders from its own saved
 * content, so set each one up (or leave its defaults) before batching.
 */
function BatchExport({ def, currentProduct, currentDraft, onError }: { def: AdTemplateDef; currentProduct: string; currentDraft: AdDraft; onError: (m: string | null) => void }) {
  const products = productsOfKind(def.productKind);
  const [picked, setPicked] = useState<Set<string>>(() => new Set([currentProduct]));
  const [pickedFormats, setPickedFormats] = useState<Set<AdFormat>>(() => new Set<AdFormat>(["PT", "ST"]));
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setPicked(new Set([currentProduct]));
    setRows([]);
    // Only when the template changes - keep the selection while switching products.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [def.id]);

  const formats = AD_FORMAT_ORDER.filter((f) => def.formats.includes(f) && pickedFormats.has(f));
  const chosen = products.filter((x) => picked.has(x.code));
  const jobs = chosen.flatMap((x) => formats.map((f) => ({ product: x.code, format: f })));

  function toggle<T>(set: Set<T>, value: T, apply: (s: Set<T>) => void) {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    apply(next);
  }

  async function run() {
    onError(null);
    setRunning(true);
    const drafts = new Map(chosen.map((x) => [x.code, x.code === currentProduct ? currentDraft : loadDraft(def, x.code)]));
    const initial: BatchRow[] = jobs.map((j) => ({ label: `${adFileBase(def, j.product, j.format, drafts.get(j.product)!.variant)}.png`, status: "pending" }));
    setRows(initial);
    for (const [i, j] of jobs.entries()) {
      setRows((r) => r.map((row, k) => (k === i ? { ...row, status: "running" } : row)));
      try {
        const { savedPath } = await api.renderAd(renderBody(def, j.product, j.format, drafts.get(j.product)!));
        setRows((r) => r.map((row, k) => (k === i ? { ...row, status: "done", savedPath } : row)));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setRows((r) => r.map((row, k) => (k === i ? { ...row, status: "error", error: message } : row)));
      }
    }
    setRunning(false);
  }

  return (
    <div className="card">
      <h2>Batch export</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Render this template for several {def.productKind === "collection" ? "formats" : `${def.productKind}s and formats`} at once. Each{" "}
        {def.productKind} uses the content you last left it with (or the defaults).
      </p>
      {products.length > 1 && (
        <div className="ad-check-grid">
          {products.map((x) => (
            <div className="field checkbox" key={x.code}>
              <input id={`batch-${x.code}`} type="checkbox" checked={picked.has(x.code)} onChange={() => toggle(picked, x.code, setPicked)} />
              <label htmlFor={`batch-${x.code}`}>
                {x.code} · {x.kind === "book" ? x.book.en : x.label}
              </label>
            </div>
          ))}
        </div>
      )}
      <div className="ad-check-grid" style={{ marginTop: 10 }}>
        {AD_FORMAT_ORDER.filter((f) => def.formats.includes(f)).map((f) => (
          <div className="field checkbox" key={f}>
            <input id={`batch-fmt-${f}`} type="checkbox" checked={pickedFormats.has(f)} onChange={() => toggle(pickedFormats, f, setPickedFormats)} />
            <label htmlFor={`batch-fmt-${f}`}>
              {f} · {AD_FORMATS[f].label}
            </label>
          </div>
        ))}
      </div>
      <div className="button-row">
        <button type="button" onClick={run} disabled={running || jobs.length === 0}>
          {running ? "Rendering…" : `Render ${jobs.length} PNG${jobs.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {rows.length > 0 && (
        <ul className="ad-results">
          {rows.map((r) => (
            <li key={r.label}>
              {r.status === "done" && r.savedPath ? (
                <a href={mediaUrl(r.savedPath)} download={fileName(r.savedPath)}>
                  {r.label}
                </a>
              ) : (
                <span>{r.label}</span>
              )}{" "}
              <span className={`badge ${r.status === "done" ? "done" : r.status === "error" ? "error" : r.status === "running" ? "running" : "queued"}`}>{r.status}</span>
              {r.error && <span className="hint"> {r.error}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
