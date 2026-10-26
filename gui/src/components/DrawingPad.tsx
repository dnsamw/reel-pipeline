import { useRef, useState, type PointerEvent } from "react";
import { Pencil, Trash2, Undo2 } from "lucide-react";
import { parseDrawing, strokePath, type DrawingStroke } from "../../../src/posts/Drawing";

/**
 * A Paint-style pencil over the post preview. Sits absolutely on top of
 * PostPreview (same box), maps pointer positions into the template's own
 * pixels and saves finished strokes into a field as JSON (src/posts/Drawing.tsx)
 * - the template draws them, so they're in the exported PNG too. Hold Shift
 * for a straight line.
 */
export function DrawingOverlay({
  width,
  height,
  value,
  onChange,
  active,
  color,
  size,
}: {
  width: number;
  height: number;
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  color: string;
  size: number;
}) {
  const [current, setCurrent] = useState<DrawingStroke | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function toTemplate(e: PointerEvent): [number, number] {
    const r = boxRef.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * width), Math.round(((e.clientY - r.top) / r.height) * height)];
  }

  function onDown(e: PointerEvent<HTMLDivElement>) {
    if (!active || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setCurrent({ color, width: size, points: toTemplate(e) });
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (!current) return;
    const [x, y] = toTemplate(e);
    if (e.shiftKey) {
      setCurrent({ ...current, points: [current.points[0], current.points[1], x, y] });
      return;
    }
    const n = current.points.length;
    // Skip points closer than 2px to the last one - keeps the saved JSON small.
    if (Math.hypot(x - current.points[n - 2], y - current.points[n - 1]) < 2) return;
    setCurrent({ ...current, points: [...current.points, x, y] });
  }

  function onUp() {
    if (!current) return;
    onChange(JSON.stringify([...parseDrawing(value), current]));
    setCurrent(null);
  }

  return (
    <div
      ref={boxRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={{ position: "absolute", inset: 0, cursor: active ? "crosshair" : "default", touchAction: active ? "none" : "auto", pointerEvents: active ? "auto" : "none" }}
    >
      {/* The line being drawn - the saved ones come back through the template itself. */}
      {current && (
        <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }} aria-hidden="true">
          <path d={strokePath(current.points)} fill="none" stroke={current.color} strokeWidth={current.width} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

/** Pencil on/off, color, thickness, undo, clear - shown above the preview. */
export function DrawingToolbar({
  value,
  onChange,
  active,
  onActiveChange,
  color,
  onColorChange,
  size,
  onSizeChange,
}: {
  value: string;
  onChange: (value: string) => void;
  active: boolean;
  onActiveChange: (on: boolean) => void;
  color: string;
  onColorChange: (c: string) => void;
  size: number;
  onSizeChange: (n: number) => void;
}) {
  const strokes = parseDrawing(value);
  return (
    <div className="drawing-toolbar">
      <button type="button" className={active ? "" : "secondary"} onClick={() => onActiveChange(!active)} title="Draw on the image (hold Shift for a straight line)">
        <Pencil size={14} /> {active ? "Drawing" : "Pencil"}
      </button>
      <input type="color" value={color} onChange={(e) => onColorChange(e.target.value)} title="Pencil color" />
      <input type="range" min={2} max={40} value={size} onChange={(e) => onSizeChange(Number(e.target.value))} title={`Thickness: ${size}px`} />
      <span className="hint">{size}px</span>
      <button type="button" className="secondary small" disabled={strokes.length === 0} onClick={() => onChange(JSON.stringify(strokes.slice(0, -1)))} title="Undo last line">
        <Undo2 size={14} />
      </button>
      <button type="button" className="secondary small" disabled={strokes.length === 0} onClick={() => onChange("[]")} title="Clear all lines">
        <Trash2 size={14} />
      </button>
    </div>
  );
}
