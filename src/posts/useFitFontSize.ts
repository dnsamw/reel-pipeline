import { useLayoutEffect, type DependencyList, type RefObject } from "react";
import { usePostHold } from "./PostReady";

/**
 * Port of the original HTML template's fit(): starts `target` at `max` px and
 * shrinks it in `step` px increments until `box` no longer overflows (or
 * `min` is reached). Sets style.fontSize imperatively - so the component must
 * NOT also set fontSize on `target` through React's style prop, or a re-render
 * would undo the fit. Re-runs whenever `deps` change (text, image on/off...).
 */
export function useFitFontSize(
  box: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  { max, min, step = 2 }: { max: number; min: number; step?: number },
  deps: DependencyList,
): void {
  const hold = usePostHold();

  useLayoutEffect(() => {
    let cancelled = false;
    const release = hold("post: fit headline");

    // Not just scrollHeight > clientHeight: a bottom-aligned box
    // (justify-content: flex-end) overflows *upward*, which scrollHeight
    // ignores - the original HTML's fit() had exactly that bug in its image
    // mode. offsetTop/offsetHeight are layout values, so the GUI preview's
    // scale() transform doesn't skew them.
    function overflows(b: HTMLElement): boolean {
      if (b.scrollHeight > b.clientHeight) return true;
      for (const child of Array.from(b.children) as HTMLElement[]) {
        if (child.offsetTop < 0 || child.offsetTop + child.offsetHeight > b.clientHeight) return true;
      }
      return false;
    }

    function fit() {
      const b = box.current;
      const t = target.current;
      if (!b || !t) return;
      let size = max;
      t.style.fontSize = `${size}px`;
      while (overflows(b) && size > min) {
        size -= step;
        t.style.fontSize = `${size}px`;
      }
    }

    // Measure once synchronously (no flash of an overflowing headline in the
    // GUI), then again after web fonts settle - metrics change once the real
    // font replaces the fallback.
    fit();
    document.fonts.ready.then(() => {
      if (!cancelled) fit();
      release();
    });
    return () => {
      cancelled = true;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max, min, step, ...deps]);
}
