import { useEffect, useState } from "react";
import { api } from "../api";
import { TemplatePicker } from "../components/TemplatePicker";
import { RecipePicker } from "../components/RecipePicker";
import { PhraseEditFields, toPhraseEdit, type PhraseEdit } from "../components/PhraseEditFields";
import { RenderQueuePanel, type RenderQueueEntry } from "../components/RenderQueuePanel";
import type { Book, Chapter, QueueItem, RecipeRecord, ReelConfig, ReelTheme, TemplateRecord } from "../types";

export function ReviewQueue() {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [templates, setTemplates] = useState<TemplateRecord[]>([]);
  const [recipes, setRecipes] = useState<RecipeRecord[]>([]);
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);

  const [book, setBook] = useState<string>("");
  const [minOrder, setMinOrder] = useState<number | "">("");
  const [maxOrder, setMaxOrder] = useState<number | "">("");
  const [templateId, setTemplateId] = useState<string>("");
  const [recipeId, setRecipeId] = useState<string>("1");
  const [tts, setTts] = useState<"default" | "true" | "false">("default");
  const [sidechain, setSidechain] = useState(false);

  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [tab, setTab] = useState<"pending" | "rendered">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [renderQueue, setRenderQueue] = useState<RenderQueueEntry[]>([]);

  useEffect(() => {
    Promise.all([api.books(), api.templates(), api.recipes(), api.defaults(), api.defaultTheme()])
      .then(([b, t, r, d, th]) => {
        setBooks(b);
        setTemplates(t);
        setRecipes(r);
        setDefaults(d);
        setDefaultTheme(th);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
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

  // Same reasoning as Batch Render's Composition picker - a preset's
  // colors only apply to the composition it was made for.
  useEffect(() => {
    const selected = templates.find((t) => t.id === templateId);
    if (selected) setRecipeId(selected.recipeId);
  }, [templateId, templates]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const phrasesPerReel = selectedTemplate?.config.phrasesPerReel ?? defaults?.phrasesPerReel;

  function reloadQueue(andExpandFirstUnrendered = false) {
    if (!defaults || minOrder === "" || maxOrder === "") return;
    api
      .queue({ book: book || null, min: minOrder, max: maxOrder, phrasesPerReel, template: recipeId })
      .then((items) => {
        setQueue(items);
        if (andExpandFirstUnrendered) {
          const next = items.find((i) => !i.rendered);
          setExpanded(next?.batchId ?? null);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    reloadQueue(true);
  }, [book, minOrder, maxOrder, phrasesPerReel, recipeId, defaults]);

  function addToRenderQueue(item: QueueItem) {
    setRenderQueue((cur) =>
      cur.some((e) => e.batchId === item.batchId)
        ? cur
        : [
            ...cur,
            {
              batchId: item.batchId,
              chapterOrder: item.chapterOrder,
              chapterTitle: item.chapterTitle,
              phrases: item.phrases,
              edits: Object.fromEntries(item.phrases.map((p) => [p.id, toPhraseEdit(p)])),
              status: "pending",
              run: null,
              error: null,
            },
          ],
    );
  }

  function removeFromRenderQueue(batchId: string) {
    setRenderQueue((cur) => cur.filter((e) => e.batchId !== batchId));
  }

  function updateRenderQueueEntry(batchId: string, update: Partial<RenderQueueEntry>) {
    setRenderQueue((cur) => cur.map((e) => (e.batchId === batchId ? { ...e, ...update } : e)));
  }

  const pendingCount = queue?.filter((i) => !i.rendered).length ?? 0;
  const renderedCount = queue?.filter((i) => i.rendered).length ?? 0;
  const visibleItems = queue?.filter((i) => (tab === "pending" ? !i.rendered : i.rendered)) ?? [];
  const renderQueueIds = new Set(renderQueue.map((e) => e.batchId));

  return (
    <div>
      <h1>Queue Render</h1>
      <p className="hint" style={{ marginTop: -8 }}>
        Check and correct each reel's text, hand-pick the ones you want, then batch-render them from the Render
        Queue on the right. For unattended bulk runs, use Batch Render instead.
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="review-layout">
        <div className="review-left">
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
                <input type="number" value={minOrder} onChange={(e) => setMinOrder(e.target.value === "" ? "" : Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Chapter order: to</label>
                <input type="number" value={maxOrder} onChange={(e) => setMaxOrder(e.target.value === "" ? "" : Number(e.target.value))} />
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
          </div>

          <div className="card">
            <h2>Queue {queue ? `(${queue.length} reel${queue.length === 1 ? "" : "s"})` : ""}</h2>
            <div className="tab-row">
              <button type="button" className={`tab${tab === "pending" ? " active" : ""}`} onClick={() => setTab("pending")}>
                Not yet ({pendingCount})
              </button>
              <button type="button" className={`tab${tab === "rendered" ? " active" : ""}`} onClick={() => setTab("rendered")}>
                Rendered ({renderedCount})
              </button>
            </div>
            {!queue ? (
              <p className="hint">Loading...</p>
            ) : queue.length === 0 ? (
              <p className="hint">No phrases matched this scope.</p>
            ) : visibleItems.length === 0 ? (
              <p className="hint">Nothing in this tab.</p>
            ) : (
              visibleItems.map((item) => (
                <QueueRow
                  key={item.batchId}
                  item={item}
                  expanded={expanded === item.batchId}
                  onToggle={() => setExpanded((cur) => (cur === item.batchId ? null : item.batchId))}
                  inRenderQueue={renderQueueIds.has(item.batchId)}
                  onToggleRenderQueue={() =>
                    renderQueueIds.has(item.batchId) ? removeFromRenderQueue(item.batchId) : addToRenderQueue(item)
                  }
                />
              ))
            )}
          </div>
        </div>

        <div className="review-right">
          <div className="card">
            <h2>Style for renders from this queue</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Applies to every reel in the Render Queue below.
            </p>
            <div className="grid">
              <div className="field">
                <label>Apply a saved template preset</label>
                <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} defaultTheme={defaultTheme} />
              </div>
              <div className="field">
                <label>Composition</label>
                <RecipePicker recipes={recipes} value={recipeId} onChange={setRecipeId} />
              </div>
              <div className="field">
                <label>Narration (TTS)</label>
                <select value={tts} onChange={(e) => setTts(e.target.value as typeof tts)}>
                  <option value="default">Use config default</option>
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </div>
              <div className="field checkbox">
                <input id="rq-sidechain" type="checkbox" checked={sidechain} onChange={(e) => setSidechain(e.target.checked)} />
                <label htmlFor="rq-sidechain">Duck music under dialogue/sfx</label>
              </div>
            </div>
          </div>

          <RenderQueuePanel
            entries={renderQueue}
            onChange={updateRenderQueueEntry}
            onRemove={removeFromRenderQueue}
            style={{ templateId: templateId || undefined, recipeId, tts, sidechain }}
            onItemRendered={() => reloadQueue(false)}
          />
        </div>
      </div>
    </div>
  );
}

function QueueRow({
  item,
  expanded,
  onToggle,
  inRenderQueue,
  onToggleRenderQueue,
}: {
  item: QueueItem;
  expanded: boolean;
  onToggle: () => void;
  inRenderQueue: boolean;
  onToggleRenderQueue: () => void;
}) {
  const [edits, setEdits] = useState<Record<string, PhraseEdit>>(() =>
    Object.fromEntries(item.phrases.map((p) => [p.id, toPhraseEdit(p)])),
  );
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function saveCorrections() {
    setError(null);
    setStatus(null);
    setSaving(true);
    try {
      await Promise.all(item.phrases.map((p) => api.updatePhrase(p.id, edits[p.id])));
      setStatus("Corrections saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="queue-row">
      <div className="queue-row-header" onClick={onToggle}>
        <span className={`badge ${item.rendered ? "done" : "running"}`}>{item.rendered ? "Rendered" : "Not yet"}</span>
        <span className="queue-row-title">
          Ch {item.chapterOrder}: {item.chapterTitle} - "{item.phrases[0]?.phrase}"
          {item.phrases.length > 1 ? ` +${item.phrases.length - 1} more` : ""}
        </span>
        {inRenderQueue && <span className="badge queued-badge">In Render Queue</span>}
        <span className="template-picker-caret">{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div className="queue-row-body">
          {error && <div className="error-banner">{error}</div>}
          {status && !error && <div className="success-banner">{status}</div>}

          {item.phrases.map((p, i) => (
            <PhraseEditFields
              key={p.id}
              label={`Phrase ${i + 1} of ${item.phrases.length}`}
              edit={edits[p.id]}
              onChange={(edit) => setEdits((cur) => ({ ...cur, [p.id]: edit }))}
            />
          ))}

          <div className="button-row">
            <button type="button" className="secondary" disabled={saving} onClick={saveCorrections}>
              {saving ? "Saving..." : "Save corrections"}
            </button>
            <button type="button" className={inRenderQueue ? "secondary" : ""} onClick={onToggleRenderQueue}>
              {inRenderQueue ? "Remove from Render Queue" : "Add to Render Queue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
