import type { GuessRevealField, IntroBeat, OutroBeat, PerPhraseBeat, ThemeVariant } from "../types";
import type { Selection } from "./Timeline";
import { contentForKind, defaultAnimation, defaultBox, newLayerId } from "../lib/layerDefaults";

/**
 * What's left for Inspector.tsx after the graph-centric editing round: a
 * `custom` beat's layers are now edited entirely on DataGraph.tsx (toolbar
 * to add, click a node to open LayerPropertyPanel.tsx, Delete to remove) -
 * RecipeEditor.tsx doesn't even mount this component when a `custom` beat
 * is selected, since there's nothing left for it to show. What remains:
 * Intro/Outro (no layer/node metaphor fits a once-per-reel scene) and
 * non-`custom` beat kinds (guessReveal's theme/direction, or nothing to
 * configure). See docs/COMPOSITION_DESIGNER.md.
 */

export const BEAT_KIND_LABEL: Record<PerPhraseBeat["kind"], string> = {
  phrase: "Phrase",
  countdown: "Countdown",
  reveal: "Reveal",
  guessReveal: "Guess + Reveal (combined)",
  custom: "Custom (layers)",
};

export function defaultBeat(kind: PerPhraseBeat["kind"]): PerPhraseBeat {
  if (kind === "guessReveal") return { kind, theme: "light", prompt: "phrase", answer: "translationSi" };
  if (kind === "custom") return { kind, theme: "light", durationInFrames: 90, layers: [contentForKind("text", defaultBox(), defaultAnimation(), newLayerId())] };
  return { kind };
}

function BeatHeader({
  beat,
  total,
  onChangeKind,
  onRemove,
}: {
  beat: PerPhraseBeat;
  total: number;
  onChangeKind: (beat: PerPhraseBeat) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid" style={{ marginBottom: 12 }}>
      <div className="field">
        <label>Kind</label>
        <select value={beat.kind} onChange={(e) => onChangeKind(defaultBeat(e.target.value as PerPhraseBeat["kind"]))}>
          {Object.entries(BEAT_KIND_LABEL).map(([kind, label]) => (
            <option key={kind} value={kind}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="danger" disabled={total <= 1} onClick={onRemove}>
          Remove this beat
        </button>
      </div>
    </div>
  );
}

function IntroFields({ intro, onChange, open, onToggleOpen }: { intro: IntroBeat; onChange: (b: IntroBeat) => void; open: boolean; onToggleOpen: () => void }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Intro</h2>
        <button type="button" className="secondary" onClick={onToggleOpen}>
          {open ? "Included in preview" : "Skipped in preview"}
        </button>
      </div>
      <div className="grid">
        <div className="field">
          <label>Theme</label>
          <select value={intro.theme} onChange={(e) => onChange({ ...intro, theme: e.target.value as ThemeVariant })}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="field">
          <label>Narration voice set</label>
          <select value={intro.introVoiceKeyword} onChange={(e) => onChange({ ...intro, introVoiceKeyword: e.target.value as "sinhala" | "english" })}>
            <option value="sinhala">Sinhala ("what does this mean?")</option>
            <option value="english">English ("how do you say this?")</option>
          </select>
        </div>
        <div className="field checkbox">
          <input
            id="intro-literal"
            type="checkbox"
            checked={intro.text.source === "literal"}
            onChange={(e) => onChange({ ...intro, text: e.target.checked ? { source: "literal", value: intro.text.source === "literal" ? intro.text.value : "" } : { source: "config.introText" } })}
          />
          <label htmlFor="intro-literal">Use fixed text instead of the global default (Settings' Intro text)</label>
        </div>
        {intro.text.source === "literal" && (
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Fixed intro text</label>
            <input type="text" value={intro.text.value} onChange={(e) => onChange({ ...intro, text: { source: "literal", value: e.target.value } })} />
          </div>
        )}
      </div>
    </div>
  );
}

function OutroFields({ outro, onChange, open, onToggleOpen }: { outro: OutroBeat; onChange: (b: OutroBeat) => void; open: boolean; onToggleOpen: () => void }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Outro</h2>
        <button type="button" className="secondary" onClick={onToggleOpen}>
          {open ? "Included in preview" : "Skipped in preview"}
        </button>
      </div>
      <div className="field">
        <label>Theme</label>
        <select value={outro.theme} onChange={(e) => onChange({ theme: e.target.value as ThemeVariant, kind: "outro" })}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </div>
  );
}

export function Inspector({
  selection,
  intro,
  outro,
  onChangeIntro,
  onChangeOutro,
  introOpen,
  outroOpen,
  onToggleIntroOpen,
  onToggleOutroOpen,
  perPhraseBeats,
  onChangeBeat,
  onRemoveBeat,
}: {
  selection: Selection;
  intro: IntroBeat;
  outro: OutroBeat;
  onChangeIntro: (b: IntroBeat) => void;
  onChangeOutro: (b: OutroBeat) => void;
  introOpen: boolean;
  outroOpen: boolean;
  onToggleIntroOpen: () => void;
  onToggleOutroOpen: () => void;
  perPhraseBeats: PerPhraseBeat[];
  onChangeBeat: (index: number, beat: PerPhraseBeat) => void;
  onRemoveBeat: (index: number) => void;
}) {
  if (selection.beatIndex === "intro") return <IntroFields intro={intro} onChange={onChangeIntro} open={introOpen} onToggleOpen={onToggleIntroOpen} />;
  if (selection.beatIndex === "outro") return <OutroFields outro={outro} onChange={onChangeOutro} open={outroOpen} onToggleOpen={onToggleOutroOpen} />;

  if (selection.beatIndex == null) {
    return (
      <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <p className="hint">Select a beat (or Intro/Outro) on the Timeline to edit it.</p>
      </div>
    );
  }

  const beatIndex = selection.beatIndex as number;
  const beat = perPhraseBeats[beatIndex];
  if (!beat || beat.kind === "custom") return null; // custom beats are edited entirely on DataGraph.tsx now

  return (
    <div className="card">
      <h2>Beat {beatIndex + 1}</h2>
      <BeatHeader beat={beat} total={perPhraseBeats.length} onChangeKind={(b) => onChangeBeat(beatIndex, b)} onRemove={() => onRemoveBeat(beatIndex)} />
      {beat.kind === "guessReveal" ? (
        <div className="grid">
          <div className="field">
            <label>Theme</label>
            <select value={beat.theme} onChange={(e) => onChangeBeat(beatIndex, { ...beat, theme: e.target.value as ThemeVariant })}>
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
                onChangeBeat(beatIndex, { ...beat, prompt, answer });
              }}
            >
              <option value="phrase">English first, then Sinhala meaning</option>
              <option value="translationSi">Sinhala meaning first, then English</option>
            </select>
          </div>
        </div>
      ) : (
        <p className="hint">This beat kind has nothing to configure.</p>
      )}
    </div>
  );
}
