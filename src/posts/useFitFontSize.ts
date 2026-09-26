import { useLayoutEffect, type DependencyList, type RefObject } from "react";
import { usePostHold } from "./PostReady";

// Not just scrollHeight > clientHeight: a bottom-aligned or centered box
// (justify-content: flex-end / space-evenly) overflows *upward* too, which
// scrollHeight ignores - the original HTML's fit() had exactly that bug in its
// image mode. offsetTop/offsetHeight are layout values, so the GUI preview's
// scale() transform doesn't skew them. `box` must be positioned (or be its
// children's offsetParent some other way) for offsetTop to be relative to it.
function overflows(b: HTMLElement): boolean {
  if (b.scrollHeight > b.clientHeight) return true;
  for (const child of Array.from(b.children) as HTMLElement[]) {
    if (child.offsetTop < 0 || child.offsetTop + child.offsetHeight > b.clientHeight) return true;
  }
  return false;
}

/**
 * Generic shrink-to-fit: calls `apply(max)`, then steps down by `step` until
 * `box` no longer overflows (or `min` is reached). `apply` must write to the
 * DOM imperatively (a style property / CSS variable React doesn't also own),
 * or a re-render would undo the fit. Re-runs whenever `deps` change.
 */
export function useShrinkToFit(
  box: RefObject<HTMLElement | null>,
  apply: (value: number) => void,
  { max, min, step }: { max: number; min: number; step: number },
  deps: DependencyList,
): void {
  const hold = usePostHold();

  useLayoutEffect(() => {
    let cancelled = false;
    const release = hold("post: fit");

    function fit() {
      const b = box.current;
      if (!b) return;
      let value = max;
      apply(value);
      while (overflows(b) && value - step >= min - 1e-9) {
        value = Math.round((value - step) * 1000) / 1000;
        apply(value);
      }
    }

    // Measure once synchronously (no flash of an overflowing layout in the
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

/** Shrinks `target`'s font-size until `box` fits - the component must NOT also set fontSize on `target` via React's style prop. */
export function useFitFontSize(
  box: RefObject<HTMLElement | null>,
  target: RefObject<HTMLElement | null>,
  { max, min, step = 2 }: { max: number; min: number; step?: number },
  deps: DependencyList,
): void {
  useShrinkToFit(
    box,
    (size) => {
      if (target.current) target.current.style.fontSize = `${size}px`;
    },
    { max, min, step },
    deps,
  );
}
