import { useRef, useState } from "react";

/**
 * A DJ-console-style knob: drag vertically to change a numeric value (up
 * increases, down decreases), instead of a labeled number input. Plain
 * pointer events, same technique as every other drag interaction in this
 * project (LayerCanvas.tsx, Timeline.tsx, DataGraph.tsx's wires) - no new
 * dependency for something this simple.
 *
 * The indicator line's angle sweeps -135deg to +135deg (270deg total,
 * matching a real analog knob's travel) across [min, max].
 */
export function Knob({
  label,
  value,
  min,
  max,
  step = 1,
  sensitivity = 1,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Value units changed per pixel of vertical drag - smaller for finer control on a wide range. */
  sensitivity?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const dragState = useRef<{ startY: number; startValue: number } | null>(null);

  function clamp(v: number): number {
    const stepped = Math.round(v / step) * step;
    return Math.min(max, Math.max(min, stepped));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startValue: value };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const deltaY = dragState.current.startY - e.clientY; // up = positive
    onChange(clamp(dragState.current.startValue + deltaY * sensitivity * step));
  }

  function onPointerUp() {
    dragState.current = null;
    setDragging(false);
  }

  const fraction = Math.min(1, Math.max(0, (value - min) / (max - min || 1)));
  const angle = -135 + fraction * 270;

  return (
    <div className="knob" title={`${label}: ${format ? format(value) : value}`}>
      <div
        className={`knob-dial${dragging ? " knob-dragging" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="knob-indicator" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <span className="knob-label">{label}</span>
      {dragging && <span className="knob-value-bubble">{format ? format(value) : value}</span>}
    </div>
  );
}
