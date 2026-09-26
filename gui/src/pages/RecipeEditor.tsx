import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ReelPreview } from "../components/ReelPreview";
import { Timeline, type Selection } from "../components/Timeline";
import { DataGraph } from "../components/DataGraph";
import { Inspector, defaultBeat } from "../components/Inspector";
import { FloatingPanel } from "../components/FloatingPanel";
import { X } from "lucide-react";
import type { CompositionRecipe, DataSourceDescriptor, IntroBeat, OutroBeat, PerPhraseBeat, RecipeRecord, ReelConfig } from "../types";

const DEFAULT_INTRO: IntroBeat = { kind: "intro", theme: "light", text: { source: "config.introText" }, introVoiceKeyword: "sinhala" };
const DEFAULT_OUTRO: OutroBeat = { kind: "outro", theme: "dark" };

interface RecipeDraft {
  name: string;
  description: string;
  dataSourceId: string;
  intro: IntroBeat;
  perPhraseBeats: PerPhraseBeat[];
  outro: OutroBeat;
  savedAt: number;
}

/**
 * Full-bleed workspace, DAW/NLE-style: the Graph (or Inspector, when
 * there's no `custom` beat to show) fills the whole area beside the
 * sidebar; Timeline, Live preview, and Position (LayerCanvas) float over
 * it as draggable/closeable panels instead of permanently consuming
 * layout space - see docs/COMPOSITION_DESIGNER.md's graph-centric editing
 * round for why. `.recipe-editor-page` is `position: fixed`, which is what
 * lets it ignore `.app-main`'s max-width/padding without a special case
 * there - fixed-position elements are placed relative to the viewport, not
 * their parent.
 */
export function RecipeEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const cloneFrom = searchParams.get("from");
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dataSourceId, setDataSourceId] = useState("BookPhrase");
  const [dataSourceList, setDataSourceList] = useState<DataSourceDescriptor[]>([]);
  const [intro, setIntro] = useState<IntroBeat>(DEFAULT_INTRO);
  const [perPhraseBeats, setPerPhraseBeats] = useState<PerPhraseBeat[]>([defaultBeat("phrase")]);
  const [outro, setOutro] = useState<OutroBeat>(DEFAULT_OUTRO);
  const [introOpen, setIntroOpen] = useState(true);
  const [outroOpen, setOutroOpen] = useState(true);
  const [selection, setSelection] = useState<Selection>({ beatIndex: null, layerId: null });

  const [builtin, setBuiltin] = useState(false);
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id ?? null);
  const [loaded, setLoaded] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState<number | null>(null); // the draft's savedAt, or null if none/dismissed
  const skipNextAutosave = useRef(false);
  const draftKey = `recipe-draft-${isNew ? "new" : id}`;
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const timelineResizeStart = useRef<{ startY: number; startHeight: number } | null>(null);

  function onTimelineResizeDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    timelineResizeStart.current = { startY: e.clientY, startHeight: timelineHeight };
  }

  function onTimelineResizeMove(e: React.PointerEvent) {
    if (!timelineResizeStart.current) return;
    const { startY, startHeight } = timelineResizeStart.current;
    const next = startHeight - (e.clientY - startY);
    setTimelineHeight(Math.min(window.innerHeight * 0.75, Math.max(140, next)));
  }

  function onTimelineResizeUp() {
    timelineResizeStart.current = null;
  }

  function applyRecord(r: RecipeRecord | CompositionRecipe) {
    setName("name" in r ? r.name : "");
    setDescription("description" in r ? r.description : "");
    setDataSourceId(r.dataSourceId);
    setIntro(r.intro);
    setPerPhraseBeats(r.perPhraseBeats);
    setOutro(r.outro);
    setSelection({ beatIndex: null, layerId: null });
  }

  useEffect(() => {
    api.defaults().then(setDefaults).catch(() => {});
    api.dataSources().then(setDataSourceList).catch(() => {});

    function finishLoading() {
      // A draft left over from an interrupted session (refresh, crash,
      // closed tab) before it was ever saved - offered, never auto-applied,
      // so it can't silently clobber whatever was just loaded from the
      // server. Skipped for builtin recipes: they can't be saved back, so
      // there's nothing meaningful to recover into.
      try {
        const raw = localStorage.getItem(draftKey);
        const draft: RecipeDraft | null = raw ? JSON.parse(raw) : null;
        setDraftAvailable(draft ? draft.savedAt : null);
      } catch {
        setDraftAvailable(null);
      }
      skipNextAutosave.current = true;
      setLoaded(true);
    }

    if (!isNew) {
      api
        .recipe(id!)
        .then((r) => {
          applyRecord(r);
          setBuiltin(r.builtin);
          setSavedId(r.id);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(finishLoading);
      return;
    }
    if (cloneFrom) {
      api
        .recipe(cloneFrom)
        .then((r) => applyRecord({ ...r, name: `${r.name} copy` }))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(finishLoading);
      return;
    }
    finishLoading();
  }, [id, isNew, cloneFrom, draftKey]);

  // Autosaves the in-progress recipe to localStorage so a refresh or closed
  // tab doesn't lose it - the actual "current state" of a beat/layer design
  // lives only in memory until Save is clicked. Debounced, and skips the
  // very first run after a load so simply opening an unedited recipe never
  // manufactures a "you have unsaved changes" draft for itself.
  useEffect(() => {
    if (!loaded || builtin) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    const t = setTimeout(() => {
      try {
        const draft: RecipeDraft = { name, description, dataSourceId, intro, perPhraseBeats, outro, savedAt: Date.now() };
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // ignore (e.g. storage full/blocked) - autosave is a convenience, not a guarantee
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, builtin, draftKey, name, description, dataSourceId, intro, perPhraseBeats, outro]);

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey);
      const draft: RecipeDraft | null = raw ? JSON.parse(raw) : null;
      if (draft) {
        setName(draft.name);
        setDescription(draft.description);
        setDataSourceId(draft.dataSourceId);
        setIntro(draft.intro);
        setPerPhraseBeats(draft.perPhraseBeats);
        setOutro(draft.outro);
        setSelection({ beatIndex: null, layerId: null });
      }
    } catch {
      // ignore
    }
    setDraftAvailable(null);
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
    setDraftAvailable(null);
  }

  function updateBeat(index: number, beat: PerPhraseBeat) {
    setPerPhraseBeats((cur) => cur.map((b, i) => (i === index ? beat : b)));
  }

  function reorderBeat(from: number, to: number) {
    if (from === to) return;
    setPerPhraseBeats((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setSelection((cur) => (cur.beatIndex === from ? { ...cur, beatIndex: to } : cur));
  }

  function removeBeat(index: number) {
    setPerPhraseBeats((cur) => (cur.length <= 1 ? cur : cur.filter((_, i) => i !== index)));
    setSelection((cur) => (cur.beatIndex === index ? { beatIndex: null, layerId: null } : cur));
  }

  function selectBeat(index: number | "intro" | "outro") {
    setSelection({ beatIndex: index, layerId: null });
  }

  function selectLayer(beatIndex: number, layerId: string | null) {
    setSelection({ beatIndex, layerId });
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = { name, description, dataSourceId, intro, perPhraseBeats, outro, transition: { at: "beforeOutro" as const, type: "fade" as const } };
      const record = savedId ? await api.updateRecipe(savedId, payload) : await api.createRecipe(payload);
      setSavedId(record.id);
      setStatus("Saved to SQLite and exported to recipes/" + record.id + ".json");
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // ignore
      }
      if (isNew) navigate(`/recipes/${record.id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function onPush() {
    if (!savedId) return;
    const message = prompt("Commit message for recipes/*.json", `Update recipe: ${name}`);
    if (!message) return;
    setPushing(true);
    setError(null);
    try {
      const result = await api.pushRecipes(savedId, message);
      setStatus(result.output || (result.pushed ? "Pushed." : "Nothing to push."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  }

  const previewRecipe: CompositionRecipe = {
    id: savedId ?? "preview-draft",
    name: name || "Untitled",
    description,
    dataSourceId,
    intro,
    perPhraseBeats,
    outro,
    transition: { at: "beforeOutro", type: "fade" },
  };

  const activeDataSource = dataSourceList.find((d) => d.id === dataSourceId) ?? null;
  const numericBeatIndex = typeof selection.beatIndex === "number" ? selection.beatIndex : null;
  const selectedBeat = numericBeatIndex != null ? perPhraseBeats[numericBeatIndex] : null;
  const isCustomSelected = selectedBeat?.kind === "custom";

  return (
    <div className="recipe-editor-page">
      <form onSubmit={onSave} className="recipe-editor-topbar">
        <fieldset disabled={builtin} style={{ border: "none", padding: 0, margin: 0, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", width: "100%" }}>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name" required style={{ fontSize: 16, fontWeight: 700, flex: "1 1 200px" }} />
          {dataSourceList.length > 1 ? (
            <select value={dataSourceId} onChange={(e) => setDataSourceId(e.target.value)} title="Data source">
              {dataSourceList.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="hint">Data source: {activeDataSource?.label ?? dataSourceId}</span>
          )}
          <div className="workspace-toggle-row">
            <button type="button" className={timelineOpen ? "" : "secondary"} onClick={() => setTimelineOpen((o) => !o)}>
              Timeline
            </button>
            <button type="button" className={previewOpen ? "" : "secondary"} onClick={() => setPreviewOpen((o) => !o)}>
              Preview
            </button>
          </div>
          <button type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save recipe"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!savedId || pushing}
            title={!savedId ? "Save at least once before pushing - the JSON export is written on save." : undefined}
            onClick={onPush}
          >
            {pushing ? "Pushing..." : "Push to GitHub"}
          </button>
          {builtin && (
            <span className="hint">
              Built-in - can't edit directly.{" "}
              <button
                type="button"
                className="secondary"
                onClick={() => navigate(`/recipes/new?from=${id}`)}
                style={{ padding: "2px 8px" }}
              >
                Clone to customize
              </button>
            </span>
          )}
        </fieldset>
      </form>

      {error && <div className="error-banner">{error}</div>}
      {status && <div className="success-banner">{status}</div>}
      {draftAvailable && (
        <div className="draft-banner">
          <span>You have unsaved changes from a previous session ({new Date(draftAvailable).toLocaleString()}).</span>
          <div className="draft-banner-actions">
            <button type="button" onClick={restoreDraft}>
              Restore
            </button>
            <button type="button" className="secondary" onClick={discardDraft}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="recipe-editor-workspace">
        <div className="recipe-editor-workspace-base">
          {isCustomSelected && selectedBeat ? (
            <DataGraph
              dataSource={activeDataSource}
              beat={selectedBeat}
              selectedLayerId={selection.layerId}
              fps={defaults?.fps ?? 30}
              onSelectLayer={(layerId) => numericBeatIndex != null && selectLayer(numericBeatIndex, layerId)}
              onChangeBeat={(b) => numericBeatIndex != null && updateBeat(numericBeatIndex, b)}
            />
          ) : (
            <div style={{ padding: 20, maxWidth: 700 }}>
              <Inspector
                selection={selection}
                intro={intro}
                outro={outro}
                onChangeIntro={setIntro}
                onChangeOutro={setOutro}
                introOpen={introOpen}
                outroOpen={outroOpen}
                onToggleIntroOpen={() => setIntroOpen((o) => !o)}
                onToggleOutroOpen={() => setOutroOpen((o) => !o)}
                perPhraseBeats={perPhraseBeats}
                onChangeBeat={updateBeat}
                onRemoveBeat={removeBeat}
              />
            </div>
          )}
        </div>

        {timelineOpen && defaults && (
          <div className="timeline-dock" style={{ height: timelineHeight }}>
            <div
              className="timeline-dock-resize-handle"
              title="Drag to resize"
              onPointerDown={onTimelineResizeDown}
              onPointerMove={onTimelineResizeMove}
              onPointerUp={onTimelineResizeUp}
              onPointerCancel={onTimelineResizeUp}
            />
            <div className="timeline-dock-header">
              <span>Timeline</span>
              <button type="button" className="floating-panel-close" title="Hide Timeline" onClick={() => setTimelineOpen(false)}>
                <X size={13} />
              </button>
            </div>
            <div className="timeline-dock-body">
              <Timeline
                recipe={previewRecipe}
                config={defaults}
                perPhraseBeats={perPhraseBeats}
                onChangeBeat={updateBeat}
                onReorderBeat={reorderBeat}
                introOpen={introOpen}
                outroOpen={outroOpen}
                selection={selection}
                onSelectBeat={selectBeat}
                onSelectLayer={selectLayer}
              />
              <div className="button-row" style={{ marginTop: 8, marginBottom: 0 }}>
                <button type="button" className="secondary" onClick={() => setPerPhraseBeats((cur) => [...cur, defaultBeat("phrase")])}>
                  + Add beat
                </button>
              </div>
            </div>
          </div>
        )}

        {previewOpen && (
          <FloatingPanel title="Live preview" defaultX={Math.max(16, window.innerWidth - 380) - 220} defaultY={window.innerHeight * 0.4} width={340} onClose={() => setPreviewOpen(false)}>
            <p className="hint" style={{ marginTop: 0, fontSize: 11 }}>
              {typeof selection.beatIndex === "number"
                ? "Looping the selected beat."
                : !introOpen || !outroOpen
                  ? `Skipping ${[!introOpen && "intro", !outroOpen && "outro"].filter(Boolean).join(" and ")}.`
                  : "Sample text/timing."}
            </p>
            {defaults ? (
              <ReelPreview
                recipe={previewRecipe}
                config={defaults}
                focusBeatIndex={typeof selection.beatIndex === "number" ? selection.beatIndex : null}
                showIntro={introOpen}
                showOutro={outroOpen}
              />
            ) : (
              <div className="preview-frame preview-loading">
                <span className="hint">Loading...</span>
              </div>
            )}
          </FloatingPanel>
        )}
      </div>
    </div>
  );
}
