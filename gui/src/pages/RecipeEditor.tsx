import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ReelPreview } from "../components/ReelPreview";
import { LayerEditor } from "../components/LayerEditor";
import type { CompositionRecipe, CustomBeat, GuessRevealField, IntroBeat, OutroBeat, PerPhraseBeat, RecipeRecord, ReelConfig, ThemeVariant } from "../types";

const BEAT_KIND_LABEL: Record<PerPhraseBeat["kind"], string> = {
  phrase: "Phrase",
  countdown: "Countdown",
  reveal: "Reveal",
  guessReveal: "Guess + Reveal (combined)",
  custom: "Custom (layers)",
};

function defaultCustomBeat(): CustomBeat {
  return {
    kind: "custom",
    theme: "light",
    durationInFrames: 90,
    layers: [
      {
        kind: "text",
        id: `layer-${Math.random().toString(36).slice(2, 9)}`,
        box: { position: { xPct: 50, yPct: 50 }, anchor: "center", widthPct: 70, rotationDeg: 0, zIndex: 1 },
        text: { source: "phraseField", field: "phrase" },
        font: "sans",
        fontSizePx: 56,
        fontWeight: 700,
        color: { source: "theme", token: "foreground" },
        align: "center",
        animation: { enter: { type: "fade", durationInFrames: 15 }, exit: { type: "none" }, delayFrames: 0 },
      },
    ],
  };
}

function defaultBeat(kind: PerPhraseBeat["kind"]): PerPhraseBeat {
  if (kind === "guessReveal") return { kind, theme: "light", prompt: "phrase", answer: "translationSi" };
  if (kind === "custom") return defaultCustomBeat();
  return { kind };
}

const DEFAULT_INTRO: IntroBeat = { kind: "intro", theme: "light", text: { source: "config.introText" }, introVoiceKeyword: "sinhala" };
const DEFAULT_OUTRO: OutroBeat = { kind: "outro", theme: "dark" };

export function RecipeEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const cloneFrom = searchParams.get("from");
  const isNew = !id || id === "new";
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [intro, setIntro] = useState<IntroBeat>(DEFAULT_INTRO);
  const [perPhraseBeats, setPerPhraseBeats] = useState<PerPhraseBeat[]>([defaultBeat("phrase")]);
  const [outro, setOutro] = useState<OutroBeat>(DEFAULT_OUTRO);

  const [builtin, setBuiltin] = useState(false);
  const [defaults, setDefaults] = useState<ReelConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(isNew ? null : id ?? null);
  const [saving, setSaving] = useState(false);
  const [pushing, setPushing] = useState(false);

  function applyRecord(r: RecipeRecord | CompositionRecipe) {
    setName("name" in r ? r.name : "");
    setDescription("description" in r ? r.description : "");
    setIntro(r.intro);
    setPerPhraseBeats(r.perPhraseBeats);
    setOutro(r.outro);
  }

  useEffect(() => {
    api.defaults().then(setDefaults).catch(() => {});
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

  function moveBeat(index: number, delta: -1 | 1) {
    setPerPhraseBeats((cur) => {
      const next = [...cur];
      const target = index + delta;
      if (target < 0 || target >= next.length) return cur;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeBeat(index: number) {
    setPerPhraseBeats((cur) => (cur.length <= 1 ? cur : cur.filter((_, i) => i !== index)));
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const payload = { name, description, intro, perPhraseBeats, outro, transition: { at: "beforeOutro" as const, type: "fade" as const } };
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
    intro,
    perPhraseBeats,
    outro,
    transition: { at: "beforeOutro", type: "fade" },
  };

  return (
    <div>
      <h1>{isNew ? "New Recipe" : builtin ? `Built-in: ${name || id}` : `Edit: ${name || id}`}</h1>
      {error && <div className="error-banner">{error}</div>}
      {status && <div className="success-banner">{status}</div>}

      {builtin && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>
            This is a built-in recipe (matches Composition {id}) and can't be edited or deleted directly.
          </p>
          <div className="button-row" style={{ marginTop: 0 }}>
            <button type="button" onClick={() => navigate(`/recipes/new?from=${id}`)}>
              Clone to customize
            </button>
          </div>
        </div>
      )}

      <div className="editor-layout">
        <form onSubmit={onSave} className="editor-form">
          <fieldset disabled={builtin} style={{ border: "none", padding: 0, margin: 0 }}>
            <div className="card">
              <h2>Basics</h2>
              <div className="grid">
                <div className="field">
                  <label>Name</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>Description</label>
                  <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="card">
              <h2>Intro</h2>
              <div className="grid">
                <div className="field">
                  <label>Theme</label>
                  <select value={intro.theme} onChange={(e) => setIntro((cur) => ({ ...cur, theme: e.target.value as ThemeVariant }))}>
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                  </select>
                </div>
                <div className="field">
                  <label>Narration voice set</label>
                  <select
                    value={intro.introVoiceKeyword}
                    onChange={(e) => setIntro((cur) => ({ ...cur, introVoiceKeyword: e.target.value as "sinhala" | "english" }))}
                  >
                    <option value="sinhala">Sinhala ("what does this mean?")</option>
                    <option value="english">English ("how do you say this?")</option>
                  </select>
                </div>
                <div className="field checkbox">
                  <input
                    id="intro-literal"
                    type="checkbox"
                    checked={intro.text.source === "literal"}
                    onChange={(e) =>
                      setIntro((cur) => ({
                        ...cur,
                        text: e.target.checked ? { source: "literal", value: cur.text.source === "literal" ? cur.text.value : "" } : { source: "config.introText" },
                      }))
                    }
                  />
                  <label htmlFor="intro-literal">Use fixed text instead of the global default (Settings' Intro text)</label>
                </div>
                {intro.text.source === "literal" && (
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <label>Fixed intro text</label>
                    <input
                      type="text"
                      value={intro.text.value}
                      onChange={(e) => setIntro((cur) => ({ ...cur, text: { source: "literal", value: e.target.value } }))}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <h2>Per-phrase beats</h2>
              <p className="hint" style={{ marginTop: 0 }}>
                Repeats once for every phrase in a reel, in this order, between the intro and outro.
              </p>
              {perPhraseBeats.map((beat, i) => (
                <div className="queue-phrase-card" key={i}>
                  <div className="hint" style={{ marginBottom: 6 }}>
                    Beat {i + 1} of {perPhraseBeats.length}
                  </div>
                  <div className="grid">
                    <div className="field">
                      <label>Kind</label>
                      <select value={beat.kind} onChange={(e) => updateBeat(i, defaultBeat(e.target.value as PerPhraseBeat["kind"]))}>
                        {Object.entries(BEAT_KIND_LABEL).map(([kind, label]) => (
                          <option key={kind} value={kind}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {beat.kind === "guessReveal" && (
                      <>
                        <div className="field">
                          <label>Theme</label>
                          <select value={beat.theme} onChange={(e) => updateBeat(i, { ...beat, theme: e.target.value as ThemeVariant })}>
                            <option value="light">Light</option>
                            <option value="dark">Dark</option>
                          </select>
                        </div>
                        <div className="field">
                          <label>Direction</label>
                          <select
                            value={beat.prompt}
                            onChange={(e) => {
                              const prompt = e.target.value as GuessRevealField;
                              const answer: GuessRevealField = prompt === "phrase" ? "translationSi" : "phrase";
                              updateBeat(i, { ...beat, prompt, answer });
                            }}
                          >
                            <option value="phrase">English first, then Sinhala meaning</option>
                            <option value="translationSi">Sinhala meaning first, then English</option>
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                  {beat.kind === "custom" && <LayerEditor beat={beat} onChange={(next) => updateBeat(i, next)} fps={defaults?.fps ?? 30} />}
                  <div className="button-row">
                    <button type="button" className="secondary" disabled={i === 0} onClick={() => moveBeat(i, -1)}>
                      ↑ Move up
                    </button>
                    <button type="button" className="secondary" disabled={i === perPhraseBeats.length - 1} onClick={() => moveBeat(i, 1)}>
                      ↓ Move down
                    </button>
                    <button type="button" className="danger" disabled={perPhraseBeats.length <= 1} onClick={() => removeBeat(i)}>
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="button-row" style={{ marginTop: 0 }}>
                <button type="button" className="secondary" onClick={() => setPerPhraseBeats((cur) => [...cur, defaultBeat("phrase")])}>
                  + Add beat
                </button>
              </div>
            </div>

            <div className="card">
              <h2>Outro</h2>
              <div className="field">
                <label>Theme</label>
                <select value={outro.theme} onChange={(e) => setOutro({ theme: e.target.value as ThemeVariant, kind: "outro" })}>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
            </div>

            <div className="button-row">
              <button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save recipe"}
              </button>
              <button type="button" className="secondary" disabled={!savedId || pushing} onClick={onPush}>
                {pushing ? "Pushing..." : "Push to GitHub"}
              </button>
            </div>
            {!savedId && <p className="hint">Save at least once before pushing - the JSON export is written on save.</p>}
          </fieldset>
        </form>

        <aside className="editor-preview">
          <div className="card preview-card">
            <h2>Live preview</h2>
            <p className="hint" style={{ marginTop: 0 }}>
              Uses the current defaults' colors/timing with sample text. Durations are approximate.
            </p>
            {defaults ? (
              <ReelPreview recipe={previewRecipe} config={defaults} />
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
