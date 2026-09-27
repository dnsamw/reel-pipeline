import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { TemplatePicker } from "../components/TemplatePicker";
import { PhraseEditFields, toPhraseEdit, type PhraseEdit } from "../components/PhraseEditFields";
import { RenderQueuePanel, type RenderQueueEntry } from "../components/RenderQueuePanel";
import type { Book, Chapter, Phrase, QueueItem, ReelConfig, ReelTheme, TemplateRecord } from "../types";
import { MAX_SECONDS_PER_PHRASE, MIN_SECONDS_PER_PHRASE } from "../../../src/compositions/timings";

export function ReviewQueue({ onlyImageTemplates = false }: { onlyImageTemplates?: boolean }) {
  const [books, setBooks] = useState<Book[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [allTemplates, setAllTemplates] = useState<TemplateRecord[]>([]);
  // Memoized so this array keeps a stable reference across renders - the
  // Composition-sync effect below depends on it, and a fresh array (from a
  // plain .filter() on every render) would re-fire that effect constantly,
  // stomping any manual Composition change right back to the picked
  // template's templateNumber.
  const templates = useMemo(
    () => (onlyImageTemplates ? allTemplates.filter((t) => t.config.backgroundImage) : allTemplates),
    [allTemplates, onlyImageTemplates],
  );
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);
  const [defaultTheme, setDefaultTheme] = useState<ReelTheme | null>(null);

  const [book, setBook] = useState<string>("");
  const [minOrder, setMinOrder] = useState<number | "">("");
  const [maxOrder, setMaxOrder] = useState<number | "">("");
  const [templateId, setTemplateId] = useState<string>("");
  const [template, setTemplate] = useState<"1" | "2" | "3">("1");
  const [tts, setTts] = useState<"default" | "true" | "false">("default");
  const [sidechain, setSidechain] = useState(false);
  // null = follow the picked template (or config default) - see phrasesPerReel/secondsPerPhrase below.
  const [phrasesPerReelOverride, setPhrasesPerReelOverride] = useState<number | null>(null);
  const [secondsPerPhraseOverride, setSecondsPerPhraseOverride] = useState<number | null>(null);

  const [queue, setQueue] = useState<QueueItem[] | null>(null);
  const [tab, setTab] = useState<"pending" | "rendered">("pending");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [renderQueue, setRenderQueue] = useState<RenderQueueEntry[]>([]);
  // "Build a reel" - phrases hand-picked one by one from the Queue, in the
  // order they'll appear in the video.
  const [pickedPhrases, setPickedPhrases] = useState<Phrase[]>([]);

  useEffect(() => {
    Promise.all([api.books(), api.templates(), api.defaults(), api.defaultTheme()])
      .then(([b, t, d, th]) => {
        setBooks(b);
        setAllTemplates(t);
        setDefaults(d);
        setDefaultTheme(th);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    api
      .settings()
      .then((s) => {
        setSidechain(s.defaultSidechain);
        setTemplate(s.defaultTemplateNumber);
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

  // Same reasoning as Batch Render's Composition dropdown - a preset's
  // colors only apply to the composition it was made for.
  useEffect(() => {
    const selected = templates.find((t) => t.id === templateId);
    if (selected) setTemplate(selected.templateNumber);
  }, [templateId, templates]);

  const selectedTemplate = templates.find((t) => t.id === templateId);
  const phrasesPerReel = phrasesPerReelOverride ?? selectedTemplate?.config.phrasesPerReel ?? defaults?.phrasesPerReel;

  // One phrase = its prompt + countdown + reveal. Capped at
  // MAX_SECONDS_PER_PHRASE by default; the server rescales the three
  // timings to fit whatever is chosen here (see fitPhraseSeconds).
  const timingBase = defaults ? { ...defaults, ...(selectedTemplate?.config ?? {}) } : null;
  const templateSecondsPerPhrase = timingBase
    ? Math.round((timingBase.phraseSeconds + timingBase.countdownSeconds + timingBase.revealSeconds) * 10) / 10
    : null;
  const secondsPerPhrase =
    secondsPerPhraseOverride ?? (templateSecondsPerPhrase != null ? Math.min(MAX_SECONDS_PER_PHRASE, templateSecondsPerPhrase) : undefined);
  const estimatedReelSeconds =
    timingBase && secondsPerPhrase != null && phrasesPerReel != null
      ? Math.round(timingBase.introSeconds + phrasesPerReel * secondsPerPhrase + timingBase.outroSeconds - timingBase.transitionSeconds)
      : null;

  function reloadQueue(andExpandFirstUnrendered = false) {
    if (!defaults || minOrder === "" || maxOrder === "") return;
    api
      .queue({ book: book || null, min: minOrder, max: maxOrder, phrasesPerReel, template })
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
  }, [book, minOrder, maxOrder, phrasesPerReel, template, defaults]);

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

  const pickLimit = phrasesPerReel ?? 6;
  const pickedIds = new Set(pickedPhrases.map((p) => p.id));

  function pickPhrase(phrase: Phrase) {
    setPickedPhrases((cur) => (cur.some((p) => p.id === phrase.id) || cur.length >= pickLimit ? cur : [...cur, phrase]));
  }

  function unpickPhrase(id: string) {
    setPickedPhrases((cur) => cur.filter((p) => p.id !== id));
  }

  function movePicked(index: number, delta: -1 | 1) {
    setPickedPhrases((cur) => {
      const target = index + delta;
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Renders exactly like a Queue reel - RenderQueuePanel only needs the
  // phrase list, which it sends as phraseIds.
  function addPickedToRenderQueue() {
    if (pickedPhrases.length === 0) return;
    const first = pickedPhrases[0];
    const batchId = `custom-${pickedPhrases.map((p) => p.id).join("-")}`;
    setRenderQueue((cur) =>
      cur.some((e) => e.batchId === batchId)
        ? cur
        : [
            ...cur,
            {
              batchId,
              chapterOrder: first.chapterOrder,
              chapterTitle: `Custom reel (${pickedPhrases.length} phrase${pickedPhrases.length === 1 ? "" : "s"})`,
              phrases: pickedPhrases,
              edits: Object.fromEntries(pickedPhrases.map((p) => [p.id, toPhraseEdit(p)])),
              status: "pending",
              run: null,
              error: null,
            },
          ],
    );
    setPickedPhrases([]);
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
      <h1>{onlyImageTemplates ? "Queue Render (New)" : "Queue Render"}</h1>
      <p className="hint" style={{ marginTop: -8 }}>
        {onlyImageTemplates
          ? "Same as Queue Render, but the template picker below only lists the newly added background-image templates."
          : "Check and correct each reel's text, hand-pick the ones you want, then batch-render them from the Render Queue on the right. For unattended bulk runs, use Batch Render instead."}
      </p>
      {onlyImageTemplates && templates.length === 0 && (
        <p className="hint">No background-image templates yet - add one under Templates with a Background image set.</p>
      )}
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
              <div className="field">
                <label>Phrases per reel</label>
                <select
                  value={phrasesPerReelOverride ?? ""}
                  onChange={(e) => setPhrasesPerReelOverride(e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">
                    Template default ({selectedTemplate?.config.phrasesPerReel ?? defaults?.phrasesPerReel ?? "..."})
                  </option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? "1 - one phrase per video" : n}
                    </option>
                  ))}
                </select>
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
                  pickedIds={pickedIds}
                  pickFull={pickedPhrases.length >= pickLimit}
                  onPick={pickPhrase}
                  onUnpick={unpickPhrase}
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
                <select value={template} onChange={(e) => setTemplate(e.target.value as "1" | "2" | "3")}>
                  <option value="1">1 - Classic</option>
                  <option value="2">2 - Side-by-side</option>
                  <option value="3">3 - Reversed (dark)</option>
                </select>
              </div>
              <div className="field">
                <label>Narration (TTS)</label>
                <select value={tts} onChange={(e) => setTts(e.target.value as typeof tts)}>
                  <option value="default">Use config default</option>
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              </div>
              <div className="field">
                <label>Seconds per phrase (max {MAX_SECONDS_PER_PHRASE})</label>
                <input
                  type="number"
                  step={0.5}
                  min={MIN_SECONDS_PER_PHRASE}
                  max={MAX_SECONDS_PER_PHRASE}
                  value={secondsPerPhrase ?? ""}
                  onChange={(e) =>
                    setSecondsPerPhraseOverride(
                      e.target.value === ""
                        ? null
                        : Math.min(MAX_SECONDS_PER_PHRASE, Math.max(MIN_SECONDS_PER_PHRASE, Number(e.target.value))),
                    )
                  }
                />
                <span className="hint">
                  Guess + countdown + answer for one phrase
                  {templateSecondsPerPhrase != null ? ` (template: ${templateSecondsPerPhrase}s)` : ""}
                  {estimatedReelSeconds != null ? ` - video about ${estimatedReelSeconds}s` : ""}
                </span>
              </div>
              <div className="field checkbox">
                <input id="rq-sidechain" type="checkbox" checked={sidechain} onChange={(e) => setSidechain(e.target.checked)} />
                <label htmlFor="rq-sidechain">Duck music under dialogue/sfx</label>
              </div>
            </div>
          </div>

          <div className="card">
            <h2>
              Build a reel ({pickedPhrases.length}/{pickLimit})
            </h2>
            {pickedPhrases.length === 0 ? (
              <p className="hint" style={{ marginTop: 0 }}>
                Open a reel in the Queue on the left and click "Add to reel" on the phrases you want, one by one. Up to {pickLimit}{" "}
                (the Phrases per reel setting).
              </p>
            ) : (
              <>
                <ol className="picked-phrase-list" style={{ paddingLeft: 20, margin: "0 0 12px" }}>
                  {pickedPhrases.map((p, i) => (
                    <li key={p.id} style={{ marginBottom: 6 }}>
                      <span>
                        {p.phrase} <span className="hint">(Ch {p.chapterOrder})</span>
                      </span>
                      <span style={{ display: "inline-flex", gap: 4, marginLeft: 8 }}>
                        <button type="button" className="secondary" disabled={i === 0} onClick={() => movePicked(i, -1)} title="Move up">
                          ↑
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={i === pickedPhrases.length - 1}
                          onClick={() => movePicked(i, 1)}
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button type="button" className="secondary" onClick={() => unpickPhrase(p.id)}>
                          Remove
                        </button>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="button-row">
                  <button type="button" onClick={addPickedToRenderQueue}>
                    Add this reel to Render Queue
                  </button>
                  <button type="button" className="secondary" onClick={() => setPickedPhrases([])}>
                    Clear
                  </button>
                </div>
              </>
            )}
          </div>

          <RenderQueuePanel
            entries={renderQueue}
            onChange={updateRenderQueueEntry}
            onRemove={removeFromRenderQueue}
            style={{ templateId: templateId || undefined, template, tts, sidechain, secondsPerPhrase }}
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
  pickedIds,
  pickFull,
  onPick,
  onUnpick,
}: {
  item: QueueItem;
  expanded: boolean;
  onToggle: () => void;
  inRenderQueue: boolean;
  onToggleRenderQueue: () => void;
  pickedIds: Set<string>;
  pickFull: boolean;
  onPick: (phrase: Phrase) => void;
  onUnpick: (id: string) => void;
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
            <div key={p.id}>
              <PhraseEditFields
                label={`Phrase ${i + 1} of ${item.phrases.length}`}
                edit={edits[p.id]}
                onChange={(edit) => setEdits((cur) => ({ ...cur, [p.id]: edit }))}
              />
              <div className="button-row" style={{ marginTop: -4, marginBottom: 12 }}>
                {pickedIds.has(p.id) ? (
                  <button type="button" className="secondary" onClick={() => onUnpick(p.id)}>
                    ✓ In reel - remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary"
                    disabled={pickFull}
                    title={pickFull ? "The reel is full - raise Phrases per reel or remove one" : undefined}
                    // Picks up any unsaved corrections typed above.
                    onClick={() => onPick({ ...p, ...edits[p.id] })}
                  >
                    + Add to reel
                  </button>
                )}
              </div>
            </div>
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
