import type { Anchor, AnimationSpec, AnimationStep, ColorRef, CustomBeat, Layer, LayerBox, Palette, PhraseTextField, TextRef, ThemeVariant } from "../types";

/**
 * Form-based editor for a `custom` beat's Layer[] - the GUI side of
 * docs/COMPOSITION_DESIGNER.md's "concrete design for the true visual
 * designer". Deliberately NOT a drag/resize canvas (that's still-open Phase
 * 3 of that doc's build-out plan) - positions/sizes are typed as % numbers
 * instead. Every layer field this renders maps 1:1 onto
 * src/compositions/recipe/layers/schema.ts, so what's typed here is exactly
 * what LayerRenderer.tsx interprets - see ReelPreview.tsx for how a saved
 * edit becomes a live preview through the real renderer.
 */

const ANCHORS: Anchor[] = ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"];
const PHRASE_FIELDS: { value: PhraseTextField; label: string }[] = [
  { value: "phrase", label: "Phrase (English)" },
  { value: "translationSi", label: "Sinhala meaning" },
  { value: "pronunciationSi", label: "Sinhala pronunciation" },
  { value: "explanation", label: "Explanation (English)" },
  { value: "explanationSi", label: "Explanation (Sinhala)" },
];
const THEME_TOKENS: (keyof Palette)[] = ["primary", "brand2", "gold", "goldInk", "foreground", "mutedForeground", "border", "background"];
const OPPOSITE_TOKENS: ("primary" | "brand2" | "gold")[] = ["primary", "brand2", "gold"];

function newLayerId(): string {
  return `layer-${Math.random().toString(36).slice(2, 9)}`;
}

function defaultBox(): LayerBox {
  return { position: { xPct: 50, yPct: 50 }, anchor: "center", widthPct: 70, rotationDeg: 0, zIndex: 1 };
}

function defaultAnimation(): AnimationSpec {
  return { enter: { type: "fade", durationInFrames: 15 }, exit: { type: "none" }, delayFrames: 0 };
}

function contentForKind(kind: Layer["kind"], box: LayerBox, animation: AnimationSpec, id: string): Layer {
  if (kind === "text") return { kind, id, box, text: { source: "literal", value: "New text" }, font: "sans", fontSizePx: 48, fontWeight: 700, color: { source: "theme", token: "foreground" }, align: "center", animation };
  if (kind === "image") return { kind, id, box, src: { source: "sceneFrameChrome" }, animation };
  return { kind: "shape", id, box, shape: "rect", fill: { source: "theme", token: "primary" }, cornerRadiusPx: 16, animation };
}

function defaultLayer(): Layer {
  return contentForKind("text", defaultBox(), defaultAnimation(), newLayerId());
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
          <input
            type="number"
            title="Duration (frames)"
            style={{ width: 90 }}
            value={step.durationInFrames}
            onChange={(e) => onChange({ ...step, durationInFrames: Number(e.target.value) })}
          />
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
          <input
            type="number"
            step={0.05}
            title="Starting scale"
            style={{ width: 90 }}
            value={step.fromScale}
            onChange={(e) => onChange({ ...step, fromScale: Number(e.target.value) })}
          />
        )}
      </div>
    </div>
  );
}

function LayerCard({ layer, index, total, onChange, onMove, onRemove }: { layer: Layer; index: number; total: number; onChange: (l: Layer) => void; onMove: (delta: -1 | 1) => void; onRemove: () => void }) {
  const { box, animation } = layer;

  function updateBox(patch: Partial<LayerBox>) {
    onChange({ ...layer, box: { ...box, ...patch } } as Layer);
  }

  return (
    <div className="queue-phrase-card">
      <div className="hint" style={{ marginBottom: 6 }}>
        Layer {index + 1} of {total} - {layer.id}
      </div>
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
                    const text: TextRef = source === "literal" ? { source, value: "" } : source === "config" ? { source, path: "introText" } : { source, field: "phrase" };
                    onChange({ ...layer, text });
                  }}
                >
                  <option value="literal">Fixed text</option>
                  <option value="phraseField">From the phrase</option>
                  <option value="config">Global intro text</option>
                </select>
                {layer.text.source === "literal" && (
                  <input type="text" value={layer.text.value} onChange={(e) => onChange({ ...layer, text: { source: "literal", value: e.target.value } })} />
                )}
                {layer.text.source === "phraseField" && (
                  <select value={layer.text.field} onChange={(e) => onChange({ ...layer, text: { source: "phraseField", field: e.target.value as PhraseTextField } })}>
                    {PHRASE_FIELDS.map((f) => (
                      <option key={f.value} value={f.value}>
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
              <select value={layer.shape} onChange={(e) => onChange({ ...layer, shape: e.target.value as "rect" | "circle" | "ring" })}>
                <option value="rect">Rectangle</option>
                <option value="circle">Circle</option>
                <option value="ring">Ring (progress)</option>
              </select>
            </div>
            <ColorRefField
              label="Fill"
              value={layer.fill ?? { source: "theme", token: "primary" }}
              onChange={(fill) => onChange({ ...layer, fill })}
              onRemove={() => onChange({ ...layer, fill: undefined })}
            />
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
                <label htmlFor={`${layer.id}-progress`}>Fill fraction tracks this beat's own timeline (demo progress binding)</label>
              </div>
            )}
          </>
        )}

        {layer.kind === "image" && (
          <div className="field">
            <label>Source</label>
            <div style={{ display: "flex", gap: 6 }}>
              <select
                value={layer.src.source}
                onChange={(e) => onChange({ ...layer, src: e.target.value === "asset" ? { source: "asset", path: "" } : { source: "sceneFrameChrome" } })}
              >
                <option value="sceneFrameChrome">Scene background chrome</option>
                <option value="asset">Asset file</option>
              </select>
              {layer.src.source === "asset" && (
                <input type="text" placeholder="e.g. images/foo.png" value={layer.src.path} onChange={(e) => onChange({ ...layer, src: { source: "asset", path: e.target.value } })} />
              )}
            </div>
          </div>
        )}

        <AnimationStepFields label="Enter animation" step={animation.enter} onChange={(enter) => onChange({ ...layer, animation: { ...animation, enter } } as Layer)} />
        <AnimationStepFields label="Exit animation" step={animation.exit} onChange={(exit) => onChange({ ...layer, animation: { ...animation, exit } } as Layer)} />
        <div className="field">
          <label>Enter delay (frames)</label>
          <input type="number" value={animation.delayFrames} onChange={(e) => onChange({ ...layer, animation: { ...animation, delayFrames: Number(e.target.value) } } as Layer)} />
        </div>
      </div>
      <div className="button-row">
        <button type="button" className="secondary" disabled={index === 0} onClick={() => onMove(-1)}>
          ↑ Move up
        </button>
        <button type="button" className="secondary" disabled={index === total - 1} onClick={() => onMove(1)}>
          ↓ Move down
        </button>
        <button type="button" className="danger" disabled={total <= 1} onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}

export function LayerEditor({ beat, onChange, fps }: { beat: CustomBeat; onChange: (beat: CustomBeat) => void; fps: number }) {
  function updateLayer(index: number, layer: Layer) {
    onChange({ ...beat, layers: beat.layers.map((l, i) => (i === index ? layer : l)) });
  }

  function moveLayer(index: number, delta: -1 | 1) {
    const next = [...beat.layers];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange({ ...beat, layers: next });
  }

  function removeLayer(index: number) {
    if (beat.layers.length <= 1) return;
    onChange({ ...beat, layers: beat.layers.filter((_, i) => i !== index) });
  }

  return (
    <div className="grid">
      <div className="field">
        <label>Theme</label>
        <select value={beat.theme} onChange={(e) => onChange({ ...beat, theme: e.target.value as ThemeVariant })}>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
      <div className="field">
        <label>Duration (seconds)</label>
        <input
          type="number"
          step={0.1}
          value={Math.round((beat.durationInFrames / fps) * 10) / 10}
          onChange={(e) => onChange({ ...beat, durationInFrames: Math.round(Number(e.target.value) * fps) })}
        />
      </div>
      <div style={{ gridColumn: "1 / -1" }}>
        <p className="hint">
          A custom beat's content is a stack of positioned layers (% of the 1080x1920 canvas), not a fixed layout - see docs/COMPOSITION_DESIGNER.md.
        </p>
        {beat.layers.map((layer, i) => (
          <LayerCard
            key={layer.id}
            layer={layer}
            index={i}
            total={beat.layers.length}
            onChange={(l) => updateLayer(i, l)}
            onMove={(delta) => moveLayer(i, delta)}
            onRemove={() => removeLayer(i)}
          />
        ))}
        <div className="button-row" style={{ marginTop: 0 }}>
          <button type="button" className="secondary" onClick={() => onChange({ ...beat, layers: [...beat.layers, defaultLayer()] })}>
            + Add layer
          </button>
        </div>
      </div>
    </div>
  );
}
