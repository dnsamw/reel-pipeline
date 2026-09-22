import { useRef, useState } from "react";
import { buildTimelineFromRecipe } from "../../../src/compositions/recipe/timeline";
import type { CompositionRecipe, CustomBeat, Layer, PerPhraseBeat, ReelConfig } from "../types";

/**
 * Primary navigation for the recipe editor - replaces the old vertical
 * per-beat card list. Two tracks:
 *  - Beats: one block per recipe.perPhraseBeats[i] (+ fixed Intro/Outro
 *    end-caps), positioned/sized from real frame durations. Drag to
 *    reorder, drag the right edge to resize (only `custom` beats have their
 *    own durationInFrames - the others derive duration from shared config,
 *    same constraint that already existed).
 *  - Layers: shown only under the selected `custom` beat, one row per
 *    layer, driven by its `timing` (src/compositions/recipe/layers/schema.ts)
 *    - drag moves startFrame, drag-edge resizes durationFrames. This is
 *    what makes it a genuine multi-track timeline instead of one row.
 *
 * Durations come from the real `buildTimelineFromRecipe` (the same
 * function the actual renderer uses via CompositionFromRecipe.tsx) with
 * batchSize=1, so the timeline never drifts from what actually renders.
 *
 * Plain pointer events throughout - the same technique validated in
 * LayerCanvas.tsx and SpikeTimeline.tsx, not a new dependency.
 */

const PX_PER_SECOND = 50;

/** `beatIndex` can also point at the fixed Intro/Outro end-caps, which aren't part of perPhraseBeats but still need to be selectable/editable in the Inspector. */
export interface Selection {
  beatIndex: number | "intro" | "outro" | null;
  layerId: string | null;
}

const BEAT_KIND_LABEL: Record<PerPhraseBeat["kind"], string> = {
  phrase: "Phrase",
  countdown: "Countdown",
  reveal: "Reveal",
  guessReveal: "Guess+Reveal",
  custom: "Custom",
};

type BeatDrag = { kind: "move" | "resize"; index: number; startX: number; startDurationInFrames: number } | null;
type LayerDrag = { kind: "move" | "resize"; layerId: string; startX: number; startFrame: number; startDurationFrames: number } | null;

export function Timeline({
  recipe,
  config,
  perPhraseBeats,
  onChangeBeat,
  onReorderBeat,
  introOpen,
  outroOpen,
  selection,
  onSelectBeat,
  onSelectLayer,
}: {
  recipe: CompositionRecipe;
  config: ReelConfig;
  perPhraseBeats: PerPhraseBeat[];
  onChangeBeat: (index: number, beat: PerPhraseBeat) => void;
  onReorderBeat: (from: number, to: number) => void;
  introOpen: boolean;
  outroOpen: boolean;
  selection: Selection;
  onSelectBeat: (index: number | "intro" | "outro") => void;
  onSelectLayer: (beatIndex: number, layerId: string | null) => void;
}) {
  const fps = config.fps || 30;
  const pxPerFrame = PX_PER_SECOND / fps;

  // batchSize=1 - exactly one timeline item per perPhraseBeats entry (plus
  // intro/outro), in the same order, so index i here lines up with
  // perPhraseBeats[i] directly.
  const items = buildTimelineFromRecipe(recipe, 1, config);
  const introDuration = items[0]?.durationInFrames ?? 0;
  const outroDuration = items[items.length - 1]?.durationInFrames ?? 0;
  const beatItems = items.slice(1, items.length - 1);

  const beatsTrackRef = useRef<HTMLDivElement>(null);
  const [beatDrag, setBeatDrag] = useState<BeatDrag>(null);

  function startBeatMove(index: number, e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelectBeat(index);
    setBeatDrag({ kind: "move", index, startX: e.clientX, startDurationInFrames: 0 });
  }

  function startBeatResize(index: number, durationInFrames: number, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setBeatDrag({ kind: "resize", index, startX: e.clientX, startDurationInFrames: durationInFrames });
  }

  function onBeatsPointerMove(e: React.PointerEvent) {
    if (!beatDrag) return;
    const deltaPx = e.clientX - beatDrag.startX;

    if (beatDrag.kind === "resize") {
      const deltaFrames = Math.round(deltaPx / pxPerFrame);
      const beat = perPhraseBeats[beatDrag.index];
      if (beat?.kind !== "custom") return;
      const next = Math.max(fps, beatDrag.startDurationInFrames + deltaFrames); // min 1s
      onChangeBeat(beatDrag.index, { ...beat, durationInFrames: next });
      return;
    }

    const track = beatsTrackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const pointerX = e.clientX - trackRect.left - introDuration * pxPerFrame;
    let acc = 0;
    let target = beatItems.length - 1;
    for (let i = 0; i < beatItems.length; i++) {
      const w = beatItems[i].durationInFrames * pxPerFrame;
      if (pointerX < acc + w / 2) {
        target = i;
        break;
      }
      acc += w;
    }
    if (target !== beatDrag.index) {
      onReorderBeat(beatDrag.index, target);
      setBeatDrag({ ...beatDrag, index: target });
    }
  }

  function endBeatDrag() {
    setBeatDrag(null);
  }

  const numericBeatIndex = typeof selection.beatIndex === "number" ? selection.beatIndex : null;
  const selectedBeat = numericBeatIndex != null ? perPhraseBeats[numericBeatIndex] : null;
  const selectedCustomBeat: CustomBeat | null = selectedBeat?.kind === "custom" ? selectedBeat : null;

  return (
    <div className="card">
      <h2>Timeline</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        Drag a beat to reorder it, drag its right edge to resize (Custom beats only). Click a beat to select it -
        a Custom beat's layers appear as their own track below, each with its own trim.
      </p>

      <TimeRuler totalFrames={items.reduce((s, it) => s + it.durationInFrames, 0)} pxPerFrame={pxPerFrame} fps={fps} />

      <div
        ref={beatsTrackRef}
        onPointerMove={onBeatsPointerMove}
        onPointerUp={endBeatDrag}
        onPointerCancel={endBeatDrag}
        style={{ position: "relative", display: "flex", height: 56, touchAction: "none" }}
      >
        <div
          onClick={() => onSelectBeat("intro")}
          className={`timeline-block timeline-block-fixed${selection.beatIndex === "intro" ? " timeline-block-selected" : ""}`}
          style={{ width: introDuration * pxPerFrame, opacity: introOpen ? 1 : 0.5 }}
          title="Click to select and edit the Intro"
        >
          Intro
        </div>
        {beatItems.map((item, i) => {
          const beat = perPhraseBeats[i];
          const selected = selection.beatIndex === i;
          return (
            <div
              key={i}
              onPointerDown={(e) => startBeatMove(i, e)}
              className={`timeline-block${selected ? " timeline-block-selected" : ""}`}
              style={{ width: item.durationInFrames * pxPerFrame, background: beat?.kind === "custom" ? "var(--gold)" : "var(--primary)" }}
            >
              {i + 1}. {BEAT_KIND_LABEL[beat?.kind ?? "phrase"]}
              {beat?.kind === "custom" && (
                <div
                  onPointerDown={(e) => startBeatResize(i, item.durationInFrames, e)}
                  className="timeline-resize-handle"
                  title="Drag to resize"
                />
              )}
            </div>
          );
        })}
        <div
          onClick={() => onSelectBeat("outro")}
          className={`timeline-block timeline-block-fixed${selection.beatIndex === "outro" ? " timeline-block-selected" : ""}`}
          style={{ width: outroDuration * pxPerFrame, opacity: outroOpen ? 1 : 0.5 }}
          title="Click to select and edit the Outro"
        >
          Outro
        </div>
      </div>

      {selectedCustomBeat && numericBeatIndex != null && (
        <LayersTrack
          beat={selectedCustomBeat}
          beatIndex={numericBeatIndex}
          pxPerFrame={pxPerFrame}
          offsetPx={introDuration * pxPerFrame}
          selectedLayerId={selection.layerId}
          onSelectLayer={(layerId) => onSelectLayer(numericBeatIndex, layerId)}
          onChangeBeat={(next) => onChangeBeat(numericBeatIndex, next)}
        />
      )}
    </div>
  );
}

function TimeRuler({ totalFrames, pxPerFrame, fps }: { totalFrames: number; pxPerFrame: number; fps: number }) {
  const totalSeconds = Math.ceil(totalFrames / fps);
  const marks = Array.from({ length: totalSeconds + 1 }, (_, i) => i);
  return (
    <div style={{ position: "relative", height: 20, marginBottom: 2 }}>
      {marks.map((s) => (
        <span key={s} className="hint" style={{ position: "absolute", left: s * fps * pxPerFrame, fontSize: 10 }}>
          {s}s
        </span>
      ))}
    </div>
  );
}

function LayersTrack({
  beat,
  beatIndex,
  pxPerFrame,
  offsetPx,
  selectedLayerId,
  onSelectLayer,
  onChangeBeat,
}: {
  beat: CustomBeat;
  beatIndex: number;
  pxPerFrame: number;
  offsetPx: number;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onChangeBeat: (beat: CustomBeat) => void;
}) {
  const [drag, setDrag] = useState<LayerDrag>(null);

  function updateLayer(layerId: string, patch: Partial<Layer>) {
    onChangeBeat({ ...beat, layers: beat.layers.map((l) => (l.id === layerId ? ({ ...l, ...patch } as Layer) : l)) });
  }

  function startMove(layer: Layer, e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    onSelectLayer(layer.id);
    setDrag({ kind: "move", layerId: layer.id, startX: e.clientX, startFrame: layer.timing?.startFrame ?? 0, startDurationFrames: 0 });
  }

  function startResize(layer: Layer, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const start = layer.timing?.startFrame ?? 0;
    const duration = layer.timing?.durationFrames ?? beat.durationInFrames - start;
    setDrag({ kind: "resize", layerId: layer.id, startX: e.clientX, startFrame: start, startDurationFrames: duration });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const deltaFrames = Math.round((e.clientX - drag.startX) / pxPerFrame);
    const layer = beat.layers.find((l) => l.id === drag.layerId);
    if (!layer) return;
    const currentDuration = layer.timing?.durationFrames ?? beat.durationInFrames - (layer.timing?.startFrame ?? 0);

    if (drag.kind === "move") {
      const maxStart = Math.max(0, beat.durationInFrames - currentDuration);
      const nextStart = Math.min(maxStart, Math.max(0, drag.startFrame + deltaFrames));
      updateLayer(layer.id, { timing: { startFrame: nextStart, durationFrames: layer.timing?.durationFrames } });
    } else {
      const start = layer.timing?.startFrame ?? 0;
      const nextDuration = Math.max(1, Math.min(beat.durationInFrames - start, drag.startDurationFrames + deltaFrames));
      updateLayer(layer.id, { timing: { startFrame: start, durationFrames: nextDuration } });
    }
  }

  function endDrag() {
    setDrag(null);
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="hint" style={{ marginBottom: 4 }}>
        Layers in beat {beatIndex + 1} - drag to move, drag the edge to trim
      </div>
      <div onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} style={{ position: "relative", paddingLeft: offsetPx, touchAction: "none" }}>
        {beat.layers.map((layer) => {
          const start = layer.timing?.startFrame ?? 0;
          const duration = layer.timing?.durationFrames ?? beat.durationInFrames - start;
          const selected = selectedLayerId === layer.id;
          return (
            <div key={layer.id} style={{ position: "relative", height: 34, marginBottom: 4 }}>
              <div
                onPointerDown={(e) => startMove(layer, e)}
                className={`timeline-block${selected ? " timeline-block-selected" : ""}`}
                style={{ position: "absolute", left: start * pxPerFrame, width: duration * pxPerFrame, height: 34, background: "var(--muted)" }}
              >
                {layer.kind}
                <div onPointerDown={(e) => startResize(layer, e)} className="timeline-resize-handle" title="Drag to trim" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
