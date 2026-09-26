import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PostColors, PostFields, PostLists, PostTemplateDef } from "../../../src/posts/types";

/**
 * Renders a post template's real component (the same one renderStill
 * captures - see src/posts/PostStill.tsx) at its native pixel size, scaled
 * down with a CSS transform to fit `width` (or the container's width when
 * omitted). Layout-based measurement inside the template (the headline
 * shrink-to-fit) is unaffected by the transform, so the preview wraps text
 * exactly as the exported PNG does.
 */
export function PostPreview({
  def,
  fields,
  lists,
  colors,
  width,
}: {
  def: PostTemplateDef;
  fields: PostFields;
  lists?: PostLists;
  colors: PostColors;
  width?: number;
}) {
  const [fontsReady, setFontsReady] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(width ?? 0);

  useEffect(() => {
    let alive = true;
    def.loadFonts().finally(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, [def]);

  useLayoutEffect(() => {
    if (width != null) return;
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth));
    ro.observe(el);
    setMeasured(el.clientWidth);
    return () => ro.disconnect();
  }, [width]);

  const w = width ?? measured;
  const scale = w / def.width;
  const Component = def.component;

  return (
    <div
      ref={outerRef}
      className="post-preview"
      style={{ width: width ?? "100%", aspectRatio: `${def.width} / ${def.height}` }}
    >
      {fontsReady && w > 0 ? (
        <div style={{ width: def.width, height: def.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <Component fields={{ ...def.defaultFields, ...fields }} lists={{ ...def.defaultLists, ...lists }} colors={{ ...def.defaultColors, ...colors }} />
        </div>
      ) : (
        <div className="post-preview-loading">
          <span className="hint">Loading…</span>
        </div>
      )}
    </div>
  );
}
