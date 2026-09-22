import { useState } from "react";
import { api } from "../api";
import { LayerCanvas } from "./LayerCanvas";
import { contentForKind, defaultAnimation, defaultBox, newLayerId } from "../lib/layerDefaults";
import type {
  Anchor,
  AnimationSpec,
  AnimationStep,
  ColorRef,
  CustomBeat,
  DataSourceField,
  GuessRevealField,
  IntroBeat,
  Layer,
  LayerBox,
  OutroBeat,
  Palette,
  PerPhraseBeat,
  ShapeLayer,
  TextRef,
  ThemeVariant,
} from "../types";
import type { Selection } from "./Timeline";

/**
 * Fields for exactly whatever the shared `selection` currently points at -
 * one beat's kind-specific options, or one layer's full field set. Replaces
 * the old LayerEditor.tsx's stacked, always-expanded list of per-layer
 * cards: there's only ever one thing open here, which is what answers
 * "don't want to scroll every time I add a layer." LayerCanvas.tsx (spatial
 * drag/resize/rotate, unchanged internally) lives inside this panel, scoped
 * to the selected beat, so you can still see/grab every layer at once
 * spatially even though only one's fields show below it.
 */

const ANCHORS: Anchor[] = ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"];
const THEME_TOKENS: (keyof Palette)[] = ["primary", "brand2", "gold", "goldInk", "foreground", "mutedForeground", "border", "background"];
const OPPOSITE_TOKENS: ("primary" | "brand2" | "gold")[] = ["primary", "brand2", "gold"];

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
  index,
  beat,
  total,
  onChangeKind,
  onRemove,
}: {
  index: number;
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

function ColorRefField({ label, value, onChange, onRemove }: { label: string; value: ColorRef; onChange: (v: ColorRef) => void; onRemove?: () => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={value.source}
          onChange={(e) => {
            const source = e.target.value as ColorRef["source"];
            if (source === "literal") onChange({ source, hex: "#000000" });
            else if (source === "theme") onChange({ source, token: "foreground" });
            else onChange({ source, token: "primary" });
          }}
        >
          <option value="literal">Literal color</option>
          <option value="theme">This beat's theme</option>
          <option value="oppositeThemeToken">Opposite theme (contrast)</option>
        </select>
        {value.source === "literal" && <input type="color" value={value.hex} onChange={(e) => onChange({ source: "literal", hex: e.target.value })} />}
        {value.source === "theme" && (
          <select value={value.token} onChange={(e) => onChange({ source: "theme", token: e.target.value as keyof Palette })}>
            {THEME_TOKENS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {value.source === "oppositeThemeToken" && (
          <select value={value.token} onChange={(e) => onChange({ source: "oppositeThemeToken", token: e.target.value as "primary" | "brand2" | "gold" })}>
            {OPPOSITE_TOKENS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {onRemove && (
          <button type="button" className="secondary" onClick={onRemove}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function AnimationStepFields({ label, step, onChange }: { label: string; step: AnimationStep; onChange: (s: AnimationStep) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select
          value={step.type}
          onChange={(e) => {
            const type = e.target.value as AnimationStep["type"];
            if (type === "none") onChange({ type });
            else if (type === "fade") onChange({ type, durationInFrames: 15 });
            else if (type === "slide") onChange({ type, from: "bottom", durationInFrames: 20 });
            else onChange({ type, fromScale: 0.8 });
          }}
        >
          <option value="none">None</option>
          <option value="fade">Fade</option>
          <option value="slide">Slide</option>
          <option value="scaleSpring">Scale (spring)</option>
        </select>
        {(step.type === "fade" || step.type === "slide") && (
          <input type="number" title="Duration (frames)" style={{ width: 90 }} value={step.durationInFrames} onChange={(e) => onChange({ ...step, durationInFrames: Number(e.target.value) })} />
        )}
        {step.type === "slide" && (
          <select value={step.from} onChange={(e) => onChange({ ...step, from: e.target.value as "top" | "bottom" | "left" | "right" })}>
            <option value="top">From top</option>
            <option value="bottom">From bottom</option>
            <option value="left">From left</option>
            <option value="right">From right</option>
          </select>
        )}
        {step.type === "scaleSpring" && (
          <input type="number" step={0.05} title="Starting scale" style={{ width: 90 }} value={step.fromScale} onChange={(e) => onChange({ ...step, fromScale: Number(e.target.value) })} />
        )}
      </div>
    </div>
  );
}

function LayerFields({ layer, dataFields, onChange }: { layer: Layer; dataFields: DataSourceField[]; onChange: (l: Layer) => void }) {
  const { box, animation } = layer;
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  function updateBox(patch: Partial<LayerBox>) {
    onChange({ ...layer, box: { ...box, ...patch } } as Layer);
  }

  async function onPickImageFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const { path } = await api.uploadImage(file);
      onChange({ ...layer, src: { source: "asset", path } } as Layer);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid">
      <div className="field">
        <label>Kind</label>
        <select value={layer.kind} onChange={(e) => onChange(contentForKind(e.target.value as Layer["kind"], box, animation, layer.id))}>
          <option value="text">Text</option>
          <option value="shape">Shape</option>
          <option value="image">Image</option>
        </select>
      </div>
      <div className="field">
        <label>Position X% / Y%</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" value={box.position.xPct} onChange={(e) => updateBox({ position: { ...box.position, xPct: Number(e.target.value) } })} />
          <input type="number" value={box.position.yPct} onChange={(e) => updateBox({ position: { ...box.position, yPct: Number(e.target.value) } })} />
        </div>
      </div>
      <div className="field">
        <label>Anchor</label>
        <select value={box.anchor} onChange={(e) => updateBox({ anchor: e.target.value as Anchor })}>
          {ANCHORS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Width% / Height%</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" value={box.widthPct ?? ""} placeholder="auto" onChange={(e) => updateBox({ widthPct: e.target.value === "" ? undefined : Number(e.target.value) })} />
          <input type="number" value={box.heightPct ?? ""} placeholder="auto" onChange={(e) => updateBox({ heightPct: e.target.value === "" ? undefined : Number(e.target.value) })} />
        </div>
      </div>
      <div className="field">
        <label>Rotation (deg) / Layer order</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input type="number" value={box.rotationDeg} onChange={(e) => updateBox({ rotationDeg: Number(e.target.value) })} />
          <input type="number" value={box.zIndex} onChange={(e) => updateBox({ zIndex: Number(e.target.value) })} />
        </div>
      </div>

      {layer.kind === "text" && (
        <>
          <div className="field">
            <label>Text source</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={layer.text.source}
                onChange={(e) => {
                  const source = e.target.value as TextRef["source"];
                  const text: TextRef = source === "literal" ? { source, value: "" } : source === "config" ? { source, path: "introText" } : { source, field: dataFields[0]?.key ?? "" };
                  onChange({ ...layer, text });
                }}
              >
                <option value="literal">Fixed text</option>
                <option value="dataField">From the data source</option>
                <option value="config">Global intro text</option>
              </select>
              {layer.text.source === "literal" && <input type="text" value={layer.text.value} onChange={(e) => onChange({ ...layer, text: { source: "literal", value: e.target.value } })} />}
              {layer.text.source === "dataField" && (
                <select value={layer.text.field} onChange={(e) => onChange({ ...layer, text: { source: "dataField", field: e.target.value } })}>
                  {dataFields.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="field">
            <label>Font / size / weight</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select value={layer.font} onChange={(e) => onChange({ ...layer, font: e.target.value as "sans" | "sinhala" })}>
                <option value="sans">Sans (English)</option>
                <option value="sinhala">Sinhala</option>
              </select>
              <input type="number" value={layer.fontSizePx} onChange={(e) => onChange({ ...layer, fontSizePx: Number(e.target.value) })} />
              <input type="number" value={layer.fontWeight} step={100} onChange={(e) => onChange({ ...layer, fontWeight: Number(e.target.value) })} />
            </div>
          </div>
          <ColorRefField label="Color" value={layer.color} onChange={(color) => onChange({ ...layer, color })} />
          <div className="field">
            <label>Align</label>
            <select value={layer.align} onChange={(e) => onChange({ ...layer, align: e.target.value as "left" | "center" | "right" })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
        </>
      )}

      {layer.kind === "shape" && (
        <>
          <div className="field">
            <label>Shape</label>
            <select value={layer.shape} onChange={(e) => onChange({ ...layer, shape: e.target.value as ShapeLayer["shape"] })}>
              <option value="rect">Rectangle</option>
              <option value="circle">Circle</option>
              <option value="ring">Ring (progress)</option>
              <option value="triangle">Triangle</option>
              <option value="star">Star</option>
              <option value="line">Line</option>
            </select>
          </div>
          <ColorRefField label="Fill" value={layer.fill ?? { source: "theme", token: "primary" }} onChange={(fill) => onChange({ ...layer, fill })} onRemove={() => onChange({ ...layer, fill: undefined })} />
          {layer.shape === "rect" && (
            <div className="field">
              <label>Corner radius (px)</label>
              <input type="number" value={layer.cornerRadiusPx ?? 0} onChange={(e) => onChange({ ...layer, cornerRadiusPx: Number(e.target.value) })} />
            </div>
          )}
          {layer.shape === "ring" && (
            <div className="field checkbox">
              <input
                id={`${layer.id}-progress`}
                type="checkbox"
                checked={!!layer.progress}
                onChange={(e) => onChange({ ...layer, progress: e.target.checked ? { source: "countdownProgress" } : undefined })}
              />
              <label htmlFor={`${layer.id}-progress`}>Fill fraction tracks this layer's own timeline window</label>
            </div>
          )}
        </>
      )}

      {layer.kind === "image" && (
        <div className="field">
          <label>Source</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select value={layer.src.source} onChange={(e) => onChange({ ...layer, src: e.target.value === "asset" ? { source: "asset", path: "" } : { source: "sceneFrameChrome" } })}>
              <option value="sceneFrameChrome">Scene background chrome</option>
              <option value="asset">Uploaded image</option>
            </select>
            {layer.src.source === "asset" && (
              <>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPickImageFile(file);
                    e.target.value = "";
                  }}
                />
                {uploading && <span className="hint">Uploading...</span>}
                {layer.src.path && !uploading && <span className="hint">{layer.src.path}</span>}
              </>
            )}
          </div>
          {uploadError && <div className="error-banner">{uploadError}</div>}
        </div>
      )}

      <AnimationStepFields label="Enter animation" step={animation.enter} onChange={(enter) => onChange({ ...layer, animation: { ...animation, enter } } as Layer)} />
      <AnimationStepFields label="Exit animation" step={animation.exit} onChange={(exit) => onChange({ ...layer, animation: { ...animation, exit } } as Layer)} />
      <div className="field">
        <label>Enter delay (frames)</label>
        <input type="number" value={animation.delayFrames} onChange={(e) => onChange({ ...layer, animation: { ...animation, delayFrames: Number(e.target.value) } } as Layer)} />
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
  onSelectLayer,
  dataFields,
  fps,
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
  onSelectLayer: (beatIndex: number, layerId: string | null) => void;
  dataFields: DataSourceField[];
  fps: number;
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

  // A local const, not a repeated `selection.beatIndex!` - TS won't carry
  // narrowing through into the closures below (they could run after a
  // later re-render), but a never-reassigned local keeps its declared type.
  const beatIndex = selection.beatIndex as number;
  const beat = perPhraseBeats[beatIndex];
  if (!beat) return null;

  if (beat.kind !== "custom") {
    return (
      <div className="card">
        <h2>Beat {beatIndex + 1}</h2>
        <BeatHeader index={beatIndex} beat={beat} total={perPhraseBeats.length} onChangeKind={(b) => onChangeBeat(beatIndex, b)} onRemove={() => onRemoveBeat(beatIndex)} />
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

  const customBeat = beat;
  const selectedLayer = customBeat.layers.find((l) => l.id === selection.layerId) ?? null;

  function updateLayer(layerId: string, layer: Layer) {
    onChangeBeat(beatIndex, { ...customBeat, layers: customBeat.layers.map((l) => (l.id === layerId ? layer : l)) });
  }

  function addLayer() {
    const layer = contentForKind("text", defaultBox(), defaultAnimation(), newLayerId());
    onChangeBeat(beatIndex, { ...customBeat, layers: [...customBeat.layers, layer] });
    onSelectLayer(beatIndex, layer.id);
  }

  function removeLayer(layerId: string) {
    if (customBeat.layers.length <= 1) return;
    onChangeBeat(beatIndex, { ...customBeat, layers: customBeat.layers.filter((l) => l.id !== layerId) });
    if (selection.layerId === layerId) onSelectLayer(beatIndex, null);
  }

  return (
    <div className="card">
      <h2>Beat {beatIndex + 1} (Custom)</h2>
      <BeatHeader index={beatIndex} beat={customBeat} total={perPhraseBeats.length} onChangeKind={(b) => onChangeBeat(beatIndex, b)} onRemove={() => onRemoveBeat(beatIndex)} />
      <div className="grid" style={{ marginBottom: 12 }}>
        <div className="field">
          <label>Theme</label>
          <select value={customBeat.theme} onChange={(e) => onChangeBeat(beatIndex, { ...customBeat, theme: e.target.value as ThemeVariant })}>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="field">
          <label>Duration (seconds)</label>
          <input
            type="number"
            step={0.1}
            value={Math.round((customBeat.durationInFrames / fps) * 10) / 10}
            onChange={(e) => onChangeBeat(beatIndex, { ...customBeat, durationInFrames: Math.round(Number(e.target.value) * fps) })}
          />
        </div>
      </div>

      <LayerCanvas beat={customBeat} selectedId={selection.layerId} onSelect={(id) => onSelectLayer(beatIndex, id)} onChange={(next) => onChangeBeat(beatIndex, next)} />

      <div className="button-row" style={{ marginTop: 10 }}>
        <button type="button" className="secondary" onClick={addLayer}>
          + Add layer
        </button>
      </div>

      {selectedLayer ? (
        <div className="queue-phrase-card" style={{ marginTop: 12 }}>
          <div className="hint" style={{ marginBottom: 6 }}>
            Layer: {selectedLayer.id}
          </div>
          <LayerFields layer={selectedLayer} dataFields={dataFields} onChange={(l) => updateLayer(selectedLayer.id, l)} />
          <div className="button-row">
            <button type="button" className="danger" disabled={customBeat.layers.length <= 1} onClick={() => removeLayer(selectedLayer.id)}>
              Remove layer
            </button>
          </div>
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 12 }}>
          Click a layer above (or on the Timeline's Layers track) to edit its fields.
        </p>
      )}
    </div>
  );
}
