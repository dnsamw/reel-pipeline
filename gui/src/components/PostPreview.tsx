import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PostColors, PostFields, PostLists, PostTemplateDef } from "../../../src/posts/types";
import { postInsets, reelSafeInsets } from "../../../src/posts/safeZones";

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
  safeZones = false,
  showGuides = false,
}: {
  def: PostTemplateDef;
  fields: PostFields;
  lists?: PostLists;
  colors: PostColors;
  width?: number;
  /** Lay the template out inside the Reels safe zones (same as the export). */
  safeZones?: boolean;
  /** Shade the areas the Reels/Stories UI covers or tall phones crop off. */
  showGuides?: boolean;
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
        <div style={{ position: "relative", width: def.width, height: def.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          <Component fields={{ ...def.defaultFields, ...fields }} lists={{ ...def.defaultLists, ...lists }} colors={{ ...def.defaultColors, ...colors }}
            insets={postInsets(def.width, def.height, safeZones)}
          />
          {showGuides && <SafeZoneGuides width={def.width} height={def.height} />}
        </div>
      ) : (
        <div className="post-preview-loading">
          <span className="hint">Loading…</span>
        </div>
      )}
    </div>
  );
}

/**
 * The reel safe zones drawn in the template's own pixels (this sits inside the
 * scaled 1:1 layer): shaded bands where the Reels/Stories UI covers the post
 * or tall phones crop it, and a dashed outline of the area content can use.
 */
export function SafeZoneGuides({ width, height }: { width: number; height: number }) {
  const i = reelSafeInsets(width, height);
  const band = "rgba(239, 68, 68, 0.28)";
  const line = Math.max(2, Math.round(width / 270));
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: i.top, background: band }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: i.bottom, background: band }} />
      <div style={{ position: "absolute", left: 0, top: i.top, bottom: i.bottom, width: i.left, background: band }} />
      <div style={{ position: "absolute", right: 0, top: i.top, bottom: i.bottom, width: i.right, background: band }} />
      <div
        style={{
          position: "absolute",
          top: i.top,
          right: i.right,
          bottom: i.bottom,
          left: i.left,
          border: `${line}px dashed rgba(239, 68, 68, 0.9)`,
        }}
      />
    </div>
  );
}
