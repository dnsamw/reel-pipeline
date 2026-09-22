import { useRef, useState } from "react";

/**
 * SPIKE - evaluation only, not wired into real recipe state. No mature,
 * free, license-clean "drop-in Remotion timeline" library exists (checked:
 * the closest match - reactvideoeditor.com's open-source tier - needs a
 * separate paid Pro license and doesn't cover keyframes/transitions anyway;
 * @videoflow/react-video-editor is a different rendering engine entirely,
 * not Remotion). So this reuses the plain-pointer-events technique that
 * already worked well for LayerCanvas.tsx's drag/resize/rotate, just along
 * one horizontal time axis instead of a 2D frame. See
 * docs/COMPOSITION_DESIGNER.md.
 */

const PX_PER_SECOND = 60;

interface Block {
  id: string;
  label: string;
  seconds: number;
  resizable: boolean;
  color: string;
}

const INITIAL: Block[] = [
  { id: "intro", label: "Intro", seconds: 3, resizable: false, color: "var(--muted)" },
  { id: "b1", label: "Beat 1 · Phrase", seconds: 4.5, resizable: false, color: "var(--primary)" },
  { id: "b2", label: "Beat 2 · Custom", seconds: 3, resizable: true, color: "var(--gold)" },
  { id: "b3", label: "Beat 3 · Countdown", seconds: 5, resizable: false, color: "var(--primary)" },
  { id: "outro", label: "Outro", seconds: 3, resizable: false, color: "var(--muted)" },
];

type Drag = { kind: "move" | "resize"; id: string; startX: number; startSeconds: number } | null;

export function SpikeTimeline() {
  const [blocks, setBlocks] = useState<Block[]>(INITIAL);
  const [drag, setDrag] = useState<Drag>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const total = blocks.reduce((s, b) => s + b.seconds, 0);

  function startResize(id: string, e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    const b = blocks.find((x) => x.id === id)!;
    setDrag({ kind: "resize", id, startX: e.clientX, startSeconds: b.seconds });
  }

  function startMove(id: string, e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    setDrag({ kind: "move", id, startX: e.clientX, startSeconds: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const deltaPx = e.clientX - drag.startX;
    const deltaSeconds = deltaPx / PX_PER_SECOND;

    if (drag.kind === "resize") {
      setBlocks((cur) => cur.map((b) => (b.id === drag.id ? { ...b, seconds: Math.max(0.5, Math.round((drag.startSeconds + deltaSeconds) * 10) / 10) } : b)));
      return;
    }

    // Reorder: find which sibling's midpoint the pointer has crossed.
    const track = trackRef.current;
    if (!track) return;
    const trackRect = track.getBoundingClientRect();
    const pointerXInTrack = e.clientX - trackRect.left;
    let acc = 0;
    let targetIndex = blocks.length - 1;
    for (let i = 0; i < blocks.length; i++) {
      const widthPx = blocks[i].seconds * PX_PER_SECOND;
      if (pointerXInTrack < acc + widthPx / 2) {
        targetIndex = i;
        break;
      }
      acc += widthPx;
    }
    setBlocks((cur) => {
      const fromIndex = cur.findIndex((b) => b.id === drag.id);
      if (fromIndex === -1 || fromIndex === targetIndex) return cur;
      const next = [...cur];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  }

  function endDrag() {
    setDrag(null);
  }

  const marks = Array.from({ length: Math.ceil(total) + 1 }, (_, i) => i);

  return (
    <div>
      <h1>Spike: home-grown timeline</h1>
      <p className="hint">
        Evaluation only. Drag a block to reorder, drag its right edge to resize (only "Custom" beats would really be
        resizable - the others' duration comes from shared config, shown here for scale). Total: {total.toFixed(1)}s.
      </p>
      <div style={{ position: "relative", height: 24, marginBottom: 4, marginLeft: 2 }}>
        {marks.map((s) => (
          <span key={s} className="hint" style={{ position: "absolute", left: s * PX_PER_SECOND, fontSize: 11 }}>
            {s}s
          </span>
        ))}
      </div>
      <div
        ref={trackRef}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ position: "relative", display: "flex", height: 64, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-soft)", overflow: "visible", touchAction: "none" }}
      >
        {blocks.map((b) => (
          <div
            key={b.id}
            onPointerDown={(e) => startMove(b.id, e)}
            style={{
              position: "relative",
              width: b.seconds * PX_PER_SECOND,
              flex: "none",
              background: b.color,
              opacity: 0.85,
              borderRight: "2px solid var(--bg)",
              color: "white",
              fontSize: 12,
              padding: "6px 8px",
              cursor: "grab",
              overflow: "hidden",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
            }}
          >
            {b.label}
            <div className="hint" style={{ color: "rgba(255,255,255,0.85)" }}>
              {b.seconds}s
            </div>
            {b.resizable && (
              <div
                onPointerDown={(e) => startResize(b.id, e)}
                title="Drag to resize"
                style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 8, cursor: "ew-resize", background: "rgba(0,0,0,0.25)" }}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
