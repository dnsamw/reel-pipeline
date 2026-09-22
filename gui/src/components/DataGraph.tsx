import { useLayoutEffect, useRef, useState } from "react";
import { defaultAnimation, defaultBox, newLayerId } from "./LayerEditor";
import type { DataSourceDescriptor, IntroBeat, Layer, OutroBeat, PerPhraseBeat } from "../types";

/**
 * The "structured graph" from docs/COMPOSITION_DESIGNER.md's data-binding
 * design: beats stay in their existing fixed left-to-right array order
 * (reordering is still the move-left/move-right buttons, not a wire) - only
 * data bindings are free-form wires, dragged from the Data Source node's
 * field sockets onto a text layer's input socket anywhere in the sequence.
 * This is deliberately NOT a general node-graph engine (no free node
 * placement, no position persistence, no arbitrary wiring) - see the doc for
 * why that scope was chosen over a true ComfyUI-style canvas.
 *
 * Sits above LayerEditor.tsx's per-beat form in RecipeEditor.tsx - clicking a
 * node here selects/scrolls to the matching form card rather than replacing
 * it; LayerCanvas.tsx (position/size/rotation) is a separate, unrelated
 * surface untouched by this component.
 */

const BEAT_KIND_SHORT: Record<PerPhraseBeat["kind"], string> = {
  phrase: "Phrase",
  countdown: "Countdown",
  reveal: "Reveal",
  guessReveal: "Guess+Reveal",
  custom: "Custom",
};

type DragWire = { fieldKey: string; x: number; y: number } | null;

export function DataGraph({
  dataSource,
  intro,
  outro,
  introOpen,
  outroOpen,
  onToggleIntro,
  onToggleOutro,
  perPhraseBeats,
  onChangeBeat,
  onMoveBeat,
  selectedBeatIndex,
  onSelectBeat,
}: {
  dataSource: DataSourceDescriptor | null;
  intro: IntroBeat;
  outro: OutroBeat;
  introOpen: boolean;
  outroOpen: boolean;
  onToggleIntro: () => void;
  onToggleOutro: () => void;
  perPhraseBeats: PerPhraseBeat[];
  onChangeBeat: (index: number, beat: PerPhraseBeat) => void;
  onMoveBeat: (index: number, delta: -1 | 1) => void;
  selectedBeatIndex: number | null;
  onSelectBeat: (index: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const socketRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [drag, setDrag] = useState<DragWire>(null);
  const [, bumpTick] = useState(0);

  // Socket DOM positions (and the container's full scrollable size, for the
  // wire-overlay SVG) are only known after layout - one extra render after
  // the beat/layer structure changes (including on mount) is enough to pick
  // up fresh positions at this node count, so no ResizeObserver machinery.
  // Deliberately keyed on perPhraseBeats only, not on every render - an
  // unconditional bump here re-triggers itself every commit (infinite loop).
  useLayoutEffect(() => {
    bumpTick((n) => n + 1);
  }, [perPhraseBeats]);

  function registerSocket(key: string, el: HTMLElement | null) {
    if (el) socketRefs.current.set(key, el);
    else socketRefs.current.delete(key);
  }

  function pointOf(key: string): { x: number; y: number } | null {
    const el = socketRefs.current.get(key);
    const container = containerRef.current;
    if (!el || !container) return null;
    const r = el.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    return { x: r.left + r.width / 2 - c.left + container.scrollLeft, y: r.top + r.height / 2 - c.top + container.scrollTop };
  }

  function toContainerPoint(clientX: number, clientY: number): { x: number; y: number } {
    const c = containerRef.current?.getBoundingClientRect();
    return { x: clientX - (c?.left ?? 0) + (containerRef.current?.scrollLeft ?? 0), y: clientY - (c?.top ?? 0) + (containerRef.current?.scrollTop ?? 0) };
  }

  function startWire(fieldKey: string, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ fieldKey, ...toContainerPoint(e.clientX, e.clientY) });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    setDrag({ fieldKey: drag.fieldKey, ...toContainerPoint(e.clientX, e.clientY) });
  }

  function bindLayer(beatIndex: number, layerId: string, fieldKey: string) {
    const beat = perPhraseBeats[beatIndex];
    if (beat?.kind !== "custom") return;
    const layers = beat.layers.map((l) => (l.id === layerId && l.kind === "text" ? { ...l, text: { source: "dataField" as const, field: fieldKey } } : l));
    onChangeBeat(beatIndex, { ...beat, layers });
  }

  function addBoundLayer(beatIndex: number, fieldKey: string) {
    const beat = perPhraseBeats[beatIndex];
    if (beat?.kind !== "custom") return;
    const layer: Layer = {
      kind: "text",
      id: newLayerId(),
      box: defaultBox(),
      text: { source: "dataField", field: fieldKey },
      font: "sans",
      fontSizePx: 48,
      fontWeight: 700,
      color: { source: "theme", token: "foreground" },
      align: "center",
      animation: defaultAnimation(),
    };
    onChangeBeat(beatIndex, { ...beat, layers: [...beat.layers, layer] });
  }

  function endWire(e: React.PointerEvent) {
    if (!drag) return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const socketEl = target?.closest<HTMLElement>("[data-socket-key]");
    const dropEl = target?.closest<HTMLElement>("[data-beat-drop]");
    if (socketEl?.dataset.socketKey) {
      const [, beatIndexStr, layerId] = socketEl.dataset.socketKey.split(":");
      bindLayer(Number(beatIndexStr), layerId, drag.fieldKey);
    } else if (dropEl?.dataset.beatDrop) {
      addBoundLayer(Number(dropEl.dataset.beatDrop), drag.fieldKey);
    }
    setDrag(null);
  }

  const wires: { from: string; to: string }[] = [];
  perPhraseBeats.forEach((beat, bi) => {
    if (beat.kind !== "custom") return;
    for (const layer of beat.layers) {
      if (layer.kind === "text" && layer.text.source === "dataField") wires.push({ from: `data:${layer.text.field}`, to: `layer:${bi}:${layer.id}` });
    }
  });

  const svgSize = { width: containerRef.current?.scrollWidth ?? 2000, height: containerRef.current?.scrollHeight ?? 300 };

  function wirePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
    const midX = (a.x + b.x) / 2;
    return `M ${a.x} ${a.y} C ${midX} ${a.y}, ${midX} ${b.y}, ${b.x} ${b.y}`;
  }

  return (
    <div className="card">
      <h2>Data &amp; sequence</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Drag a field's dot onto a text layer's socket to bind it, or onto empty space in a Custom beat to add a new
        bound text layer. Click a beat to jump to it below.
      </p>
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={endWire}
        onPointerCancel={() => setDrag(null)}
        style={{ position: "relative", display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8, touchAction: "none" }}
      >
        <svg width={svgSize.width} height={svgSize.height} style={{ position: "absolute", top: 0, left: 0, pointerEvents: "none" }}>
          {wires.map((w, i) => {
            const a = pointOf(w.from);
            const b = pointOf(w.to);
            return a && b ? <path key={i} d={wirePath(a, b)} stroke="var(--primary)" strokeWidth={2} fill="none" /> : null;
          })}
          {drag &&
            (() => {
              const a = pointOf(`data:${drag.fieldKey}`);
              return a ? <path d={wirePath(a, drag)} stroke="var(--gold)" strokeWidth={2} strokeDasharray="4 3" fill="none" /> : null;
            })()}
        </svg>

        <div className="datagraph-node" style={{ position: "sticky", left: 0, zIndex: 1 }}>
          <div className="datagraph-node-title">{dataSource?.label ?? "Data source"}</div>
          {(dataSource?.fields ?? []).map((f) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0" }}>
              <span
                ref={(el) => registerSocket(`data:${f.key}`, el)}
                onPointerDown={(e) => startWire(f.key, e)}
                title="Drag onto a text layer to bind"
                style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--primary)", cursor: "grab", flex: "none" }}
              />
              <span style={{ fontSize: 12 }}>{f.label}</span>
            </div>
          ))}
        </div>

        <div className="datagraph-node" style={{ opacity: introOpen ? 1 : 0.5, cursor: "pointer" }} onClick={onToggleIntro} title="Click to show/hide the Intro section below">
          <div className="datagraph-node-title">Intro</div>
          <div className="hint">{intro.text.source === "literal" ? "fixed text" : "global intro text"}</div>
        </div>

        {perPhraseBeats.map((beat, i) => (
          <div
            key={i}
            className="datagraph-node"
            data-beat-drop={beat.kind === "custom" ? i : undefined}
            style={{ outline: selectedBeatIndex === i ? "2px solid var(--primary)" : undefined }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="datagraph-node-title" style={{ cursor: "pointer" }} onClick={() => onSelectBeat(i)}>
                {i + 1}. {BEAT_KIND_SHORT[beat.kind]}
              </span>
              <span style={{ display: "flex", gap: 2 }}>
                <button type="button" className="secondary" disabled={i === 0} onClick={() => onMoveBeat(i, -1)} style={{ padding: "0 6px" }}>
                  ←
                </button>
                <button type="button" className="secondary" disabled={i === perPhraseBeats.length - 1} onClick={() => onMoveBeat(i, 1)} style={{ padding: "0 6px" }}>
                  →
                </button>
              </span>
            </div>
            {beat.kind === "custom" ? (
              <div>
                {beat.layers.map((layer) => (
                  <div key={layer.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", cursor: "pointer" }} onClick={() => onSelectBeat(i)}>
                    {layer.kind === "text" ? (
                      <span
                        ref={(el) => registerSocket(`layer:${i}:${layer.id}`, el)}
                        data-socket-key={`layer:${i}:${layer.id}`}
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: "50%",
                          border: "2px solid var(--primary)",
                          background: layer.text.source === "dataField" ? "var(--primary)" : "transparent",
                          flex: "none",
                        }}
                      />
                    ) : (
                      <span style={{ width: 10, flex: "none" }} />
                    )}
                    <span style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {layer.kind}
                      {layer.kind === "text" && layer.text.source === "dataField" ? ` ← ${layer.text.field}` : ""}
                    </span>
                  </div>
                ))}
                {beat.layers.length === 0 && <div className="hint">drop a field here</div>}
              </div>
            ) : (
              <div className="hint" style={{ cursor: "pointer" }} onClick={() => onSelectBeat(i)}>
                {beat.kind === "guessReveal" ? `${beat.theme}, ${beat.prompt === "phrase" ? "EN first" : "SI first"}` : "no options"}
              </div>
            )}
          </div>
        ))}

        <div className="datagraph-node" style={{ opacity: outroOpen ? 1 : 0.5, cursor: "pointer" }} onClick={onToggleOutro} title="Click to show/hide the Outro section below">
          <div className="datagraph-node-title">Outro</div>
          <div className="hint">{outro.theme}</div>
        </div>
      </div>
    </div>
  );
}
