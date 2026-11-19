import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AdCanvas, type AdContent } from "../../../src/ads/AdCanvas";
import { loadAdFonts } from "../../../src/ads/AdKit";
import { AD_FORMATS, type AdTemplateDef } from "../../../src/ads/types";
import { SafeZoneGuides } from "./PostPreview";

/**
 * Renders an ad through the same AdCanvas the "Ad" still captures (see
 * src/ads/AdStill.tsx), at its native pixel size, scaled down with a CSS
 * transform to fit `width` (or the container's width). Layout measurement in
 * the template (text fitting) ignores the transform, so the preview wraps
 * text exactly as the PNG does.
 */
export function AdPreview({ def, width, showGuides = false, ...content }: AdContent & { def: AdTemplateDef; width?: number; showGuides?: boolean }) {
  const [fontsReady, setFontsReady] = useState(false);
  const outerRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(width ?? 0);
  const size = AD_FORMATS[content.format];

  useEffect(() => {
    let alive = true;
    loadAdFonts().finally(() => alive && setFontsReady(true));
    return () => {
      alive = false;
    };
  }, []);

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

  return (
    <div ref={outerRef} className="post-preview" style={{ width: width ?? "100%", aspectRatio: `${size.width} / ${size.height}` }}>
      {fontsReady && w > 0 ? (
        <div style={{ position: "relative", width: size.width, height: size.height, transform: `scale(${w / size.width})`, transformOrigin: "top left" }}>
          <AdCanvas def={def} {...content} />
          {showGuides && <SafeZoneGuides width={size.width} height={size.height} />}
        </div>
      ) : (
        <div className="post-preview-loading">
          <span className="hint">Loading…</span>
        </div>
      )}
    </div>
  );
}
