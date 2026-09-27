import { createContext, useContext } from "react";
import { staticFile } from "remotion";

/**
 * Post templates do async work before they're "done" (fonts, image decode,
 * headline shrink-to-fit). Inside a Remotion render that has to block the
 * screenshot via delayRender/continueRender; in the GUI's live preview there's
 * nothing to block. Templates call `hold()` and invoke the returned release
 * function when finished - PostStill.tsx provides the delayRender-backed
 * version, the default here is a no-op for the GUI.
 */
export type HoldFn = (label: string) => () => void;

const noopHold: HoldFn = () => () => {};

export const PostHoldContext = createContext<HoldFn>(noopHold);

export function usePostHold(): HoldFn {
  return useContext(PostHoldContext);
}

/** data:/http(s):/blob: URLs pass through; anything else is treated as an assets/-relative path ("images/x.png", as returned by the GUI's image upload). */
export function resolvePostAsset(src: string): string {
  if (!src) return "";
  if (/^(data:|https?:|blob:)/.test(src)) return src;
  return staticFile(src.replace(/^\/+/, ""));
}

export function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Linear blend of two #rrggbb colors - `t` = 0 gives `a`, 1 gives `b`. */
export function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    let h = hex.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const to = (x: number) => Math.round(x).toString(16).padStart(2, "0");
  return `#${to(ar + (br - ar) * t)}${to(ag + (bg - ag) * t)}${to(ab + (bb - ab) * t)}`;
}
