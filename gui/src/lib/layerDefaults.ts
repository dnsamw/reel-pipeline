import type { AnimationSpec, Layer, LayerBox } from "../types";

/**
 * What a freshly-created layer looks like - shared between Inspector.tsx's
 * "+ Add layer" button and DataGraph.tsx's "drop a field onto empty space"
 * quick-add flow, so both produce the same starting point.
 */

export function newLayerId(): string {
  return `layer-${Math.random().toString(36).slice(2, 9)}`;
}

export function defaultBox(): LayerBox {
  return { position: { xPct: 50, yPct: 50 }, anchor: "center", widthPct: 70, rotationDeg: 0, zIndex: 1 };
}

export function defaultAnimation(): AnimationSpec {
  return { enter: { type: "fade", durationInFrames: 15 }, exit: { type: "none" }, delayFrames: 0 };
}

export function contentForKind(kind: Layer["kind"], box: LayerBox, animation: AnimationSpec, id: string): Layer {
  if (kind === "text") return { kind, id, box, text: { source: "literal", value: "New text" }, font: "sans", fontSizePx: 48, fontWeight: 700, color: { source: "theme", token: "foreground" }, align: "center", animation };
  if (kind === "image") return { kind, id, box, src: { source: "sceneFrameChrome" }, animation };
  return { kind: "shape", id, box, shape: "rect", fill: { source: "theme", token: "primary" }, cornerRadiusPx: 16, animation };
}

export function defaultLayer(): Layer {
  return contentForKind("text", defaultBox(), defaultAnimation(), newLayerId());
}

// Shared between DataGraph.tsx's node labels and Timeline.tsx's layer-track
// rows so a layer reads as the same thing in both places.
export function layerLabel(layer: Layer, index: number): string {
  return `${index + 1}. ${layer.kind}`;
}

export function boundDataField(layer: Layer): string | null {
  return layer.kind === "text" && layer.text.source === "dataField" ? layer.text.field : null;
}
