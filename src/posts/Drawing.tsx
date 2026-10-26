/**
 * Freehand pencil strokes drawn on a post (gui DrawingPad.tsx), stored as
 * JSON in one of the template's fields so they travel with the draft into
 * renderStill like any other content. Points are in the template's own
 * pixels, so a stroke lands in the same place at every preview scale.
 */
export interface DrawingStroke {
  color: string;
  width: number;
  /** Flat x,y pairs: [x0, y0, x1, y1, ...]. */
  points: number[];
}

export function parseDrawing(value: string | undefined): DrawingStroke[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((s) => s && Array.isArray(s.points) && s.points.length >= 2) : [];
  } catch {
    return [];
  }
}

export function strokePath(points: number[]): string {
  // A lone click is one point - repeat it so the round cap draws a dot.
  const pts = points.length === 2 ? [...points, ...points] : points;
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
  return d;
}

/** The strokes as one full-size SVG layer - put it last in the template so it draws over everything. */
export function DrawingLayer({ strokes, width, height }: { strokes: DrawingStroke[]; width: number; height: number }) {
  if (strokes.length === 0) return null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden="true">
      {strokes.map((s, i) => (
        <path key={i} d={strokePath(s.points)} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
