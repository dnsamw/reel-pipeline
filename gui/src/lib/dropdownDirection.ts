/** Must match .template-picker-menu's max-height in styles.css. */
const MENU_MAX_HEIGHT = 320;

/**
 * Whether a dropdown anchored to `el` should open upward: only when the
 * menu wouldn't fit below it in the viewport and there's more room above.
 */
export function shouldOpenUp(el: HTMLElement | null): boolean {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const below = window.innerHeight - rect.bottom;
  const above = rect.top;
  return below < MENU_MAX_HEIGHT + 8 && above > below;
}
