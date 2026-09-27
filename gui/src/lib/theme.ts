export type ThemePref = "system" | "light" | "dark";

// Must match the inline script in gui/index.html, which applies the saved
// theme before React loads so the page never flashes the wrong colours.
export const THEME_KEY = "studypal-studio:theme";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** "system" removes data-theme so styles.css follows prefers-color-scheme; light/dark pin it. */
export function applyThemePref(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  try {
    if (pref === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // per-viewer convenience only
  }
}

export const NEXT_THEME: Record<ThemePref, ThemePref> = { system: "light", light: "dark", dark: "system" };
