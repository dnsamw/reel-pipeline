import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ReelPreview } from "../components/ReelPreview";
import { Timeline, type Selection } from "../components/Timeline";
import { DataGraph } from "../components/DataGraph";
import { LayerCanvas } from "../components/LayerCanvas";
import { Inspector, defaultBeat } from "../components/Inspector";
import type { CompositionRecipe, DataSourceDescriptor, IntroBeat, OutroBeat, PerPhraseBeat, RecipeRecord, ReelConfig } from "../types";

const DEFAULT_INTRO: IntroBeat = { kind: "intro", theme: "light", text: { source: "config.introText" }, introVoiceKeyword: "sinhala" };
const DEFAULT_OUTRO: OutroBeat = { kind: "outro", theme: "dark" };

/**
 * Canvas-style rebuild - replaces the old vertical stacked-card form with
 * one screen: a Timeline (primary navigation/sequencing, multi-track),
 * a Graph (data-binding, scoped to the selected beat), and an Inspector
 * (fields for exactly the current selection). All three read/write the same
 * `perPhraseBeats` state and a single shared `selection`, kept in sync with
 * the live preview's focus. See docs/COMPOSITION_DESIGNER.md.
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
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);

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
    if (!isNew) {
      api
        .recipe(id!)
        .then((r) => {
          applyRecord(r);
          setBuiltin(r.builtin);
          setSavedId(r.id);
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
      return;
    }
    if (cloneFrom) {
      api
        .recipe(cloneFrom)
        .then((r) => applyRecord({ ...r, name: `${r.name} copy` }))
        .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }
  }, [id, isNew, cloneFrom]);

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

  return (
    <div>
      <form onSubmit={onSave}>
        <fieldset disabled={builtin} style={{ border: "none", padding: 0, margin: 0 }}>
          <div className="card" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name" required style={{ fontSize: 16, fontWeight: 700, flex: "1 1 220px" }} />
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
            <button type="button" className="secondary" onClick={() => setPreviewOpen((o) => !o)}>
              {previewOpen ? "Hide preview" : "Show preview"}
            </button>
            <button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save recipe"}
            </button>
            <button type="button" className="secondary" disabled={!savedId || pushing} onClick={onPush}>
              {pushing ? "Pushing..." : "Push to GitHub"}
            </button>
          </div>

          {error && <div className="error-banner">{error}</div>}
          {status && <div className="success-banner">{status}</div>}
          {builtin && (
            <div className="card">
              <p className="hint" style={{ marginTop: 0 }}>
                This is a built-in recipe (matches Composition {id}) and can't be edited or deleted directly.
              </p>
              <button type="button" onClick={() => navigate(`/recipes/new?from=${id}`)}>
                Clone to customize
              </button>
            </div>
          )}

          {defaults && (
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
          )}

          <div className="button-row" style={{ marginTop: 0, marginBottom: 20 }}>
            <button type="button" className="secondary" onClick={() => setPerPhraseBeats((cur) => [...cur, defaultBeat("phrase")])}>
              + Add beat
            </button>
          </div>

          {selectedBeat?.kind === "custom" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <DataGraph
                dataSource={activeDataSource}
                beat={selectedBeat}
                selectedLayerId={selection.layerId}
                fps={defaults?.fps ?? 30}
                onSelectLayer={(layerId) => numericBeatIndex != null && selectLayer(numericBeatIndex, layerId)}
                onChangeBeat={(b) => numericBeatIndex != null && updateBeat(numericBeatIndex, b)}
              />
              <div className="card">
                <h2>Position</h2>
                <p className="hint" style={{ marginTop: 0 }}>
                  Drag a layer to move it, the square handle to resize, the round handle to rotate.
                </p>
                <LayerCanvas
                  beat={selectedBeat}
                  selectedId={selection.layerId}
                  onSelect={(id) => selectLayer(numericBeatIndex!, id)}
                  onChange={(b) => numericBeatIndex != null && updateBeat(numericBeatIndex, b)}
                />
              </div>
            </div>
          ) : (
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
          )}

          {!savedId && <p className="hint">Save at least once before pushing - the JSON export is written on save.</p>}
        </fieldset>
      </form>

      {previewOpen && (
        <div className="card preview-card floating-preview">
          <h2 style={{ fontSize: 14 }}>Live preview</h2>
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
        </div>
      )}
    </div>
  );
}
