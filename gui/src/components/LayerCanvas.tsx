import { useRef, useState } from "react";
import type { Anchor, CustomBeat, Layer, LayerBox } from "../types";

/**
 * Phase 3 of docs/COMPOSITION_DESIGNER.md's layer-designer plan: drag to
 * move, a corner handle to resize, a top handle to rotate - directly on a
 * scaled-down 1080x1920 canvas, instead of only the typed %-number fields
 * in LayerEditor.tsx (which stays alongside this for font/color/animation/
 * text-source, none of which a mouse is a better input for). Plain pointer
 * events, no drag library - the math is simple enough (percent-of-canvas
 * deltas) that one wasn't worth adding as a dependency.
 */

// Mirrors LayerRenderer.tsx's anchorOffset table exactly - if the two ever
// disagree, the canvas would show a layer somewhere the real render doesn't.
const anchorOffset: Record<Anchor, [number, number]> = {
  "top-left": [0, 0],
  "top-center": [50, 0],
  "top-right": [100, 0],
  "center-left": [0, 50],
  center: [50, 50],
  "center-right": [100, 50],
  "bottom-left": [0, 100],
  "bottom-center": [50, 100],
  "bottom-right": [100, 100],
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function layerLabel(layer: Layer): string {
  if (layer.kind === "text") return layer.text.source === "literal" ? layer.text.value || "(empty text)" : layer.text.source === "phraseField" ? `{${layer.text.field}}` : "{introText}";
  if (layer.kind === "shape") return layer.shape;
  return layer.src.source === "sceneFrameChrome" ? "chrome" : layer.src.path || "(asset)";
}

type DragMode = { kind: "move" | "resize" | "rotate"; layerId: string; startClientX: number; startClientY: number; startBox: LayerBox };

export function LayerCanvas({ beat, selectedId, onSelect, onChange }: { beat: CustomBeat; selectedId: string | null; onSelect: (id: string) => void; onChange: (beat: CustomBeat) => void }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragMode | null>(null);

  function updateLayerBox(layerId: string, box: LayerBox) {
    onChange({ ...beat, layers: beat.layers.map((l) => (l.id === layerId ? ({ ...l, box } as Layer) : l)) });
  }

  function startDrag(kind: DragMode["kind"], layer: Layer, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelect(layer.id);
    setDrag({ kind, layerId: layer.id, startClientX: e.clientX, startClientY: e.clientY, startBox: layer.box });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    const { startBox } = drag;

    if (drag.kind === "move") {
      updateLayerBox(drag.layerId, {
        ...startBox,
        position: { xPct: clamp(startBox.position.xPct + dxPct, 0, 100), yPct: clamp(startBox.position.yPct + dyPct, 0, 100) },
      });
    } else if (drag.kind === "resize") {
      updateLayerBox(drag.layerId, {
        ...startBox,
        widthPct: clamp((startBox.widthPct ?? 30) + dxPct, 4, 100),
        heightPct: startBox.heightPct != null ? clamp(startBox.heightPct + dyPct, 2, 100) : undefined,
      });
    } else {
      const cx = rect.left + (rect.width * startBox.position.xPct) / 100;
      const cy = rect.top + (rect.height * startBox.position.yPct) / 100;
      const angle = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
      updateLayerBox(drag.layerId, { ...startBox, rotationDeg: Math.round(angle + 90) });
    }
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div style={{ maxWidth: 280, margin: "0 auto" }}>
      <div
        ref={canvasRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1080 / 1920",
          background: beat.theme === "dark" ? "#150f1a" : "#ffffff",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
          touchAction: "none",
        }}
      >
        {[...beat.layers]
          .sort((a, b) => a.box.zIndex - b.box.zIndex)
          .map((layer) => {
            const [ox, oy] = anchorOffset[layer.box.anchor];
            const selected = layer.id === selectedId;
            return (
              <div
                key={layer.id}
                onPointerDown={(e) => startDrag("move", layer, e)}
                style={{
                  position: "absolute",
                  left: `${layer.box.position.xPct}%`,
                  top: `${layer.box.position.yPct}%`,
                  width: layer.box.widthPct != null ? `${layer.box.widthPct}%` : "auto",
                  height: layer.box.heightPct != null ? `${layer.box.heightPct}%` : "auto",
                  minWidth: 24,
                  minHeight: 16,
                  transform: `translate(-${ox}%, -${oy}%) rotate(${layer.box.rotationDeg}deg)`,
                  border: selected ? "2px solid var(--primary)" : "1px dashed rgba(150,150,150,0.6)",
                  background: selected ? "rgba(88,35,139,0.12)" : "rgba(150,150,150,0.08)",
                  cursor: "move",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: beat.theme === "dark" ? "#e5e5e5" : "#333",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "100%",
                    pointerEvents: "none",
                  }}
                >
                  {layerLabel(layer)}
                </span>

                {selected && (
                  <>
                    <div
                      onPointerDown={(e) => startDrag("resize", layer, e)}
                      title="Drag to resize"
                      style={{
                        position: "absolute",
                        right: -6,
                        bottom: -6,
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: "var(--primary)",
                        cursor: "nwse-resize",
                      }}
                    />
                    <div
                      onPointerDown={(e) => startDrag("rotate", layer, e)}
                      title="Drag to rotate"
                      style={{
                        position: "absolute",
                        left: "50%",
                        top: -22,
                        width: 10,
                        height: 10,
                        marginLeft: -5,
                        borderRadius: "50%",
                        background: "var(--gold)",
                        cursor: "grab",
                      }}
                    />
                  </>
                )}
              </div>
            );
          })}
      </div>
      <p className="hint" style={{ marginTop: 6 }}>
        Drag a layer to move it, the square handle to resize, the round handle to rotate. Click a layer to select it and edit its other fields below.
      </p>
    </div>
  );
}
