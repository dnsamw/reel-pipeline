import { createContext, useContext, type ReactNode } from "react";
import { colors, darkColors, mix, type Palette } from "./tokens";

/**
 * A template's full color set - light and dark variants, since every scene
 * component picks one or the other via its own `theme` prop (see SceneFrame,
 * IntroScene, OutroScene). A template library preset overrides this whole
 * object; anything not overridden falls back to the brand default below.
 */
export interface ReelTheme {
  light: Palette;
  dark: Palette;
}

export const defaultTheme: ReelTheme = { light: colors, dark: darkColors };

const ThemeCtx = createContext<ReelTheme>(defaultTheme);

/**
 * Wraps a whole composition's render tree (see
 * recipe/CompositionFromRecipe.tsx) so every scene underneath reads the same
 * palette without each one needing a theme prop threaded through render
 * props - only the composition root needs to know about `config.theme`.
 */
export function ThemeProvider({ theme, children }: { theme: ReelTheme | null; children: ReactNode }) {
  return <ThemeCtx.Provider value={theme ?? defaultTheme}>{children}</ThemeCtx.Provider>;
}

/**
 * A palette plus its derived tints (light card/badge backgrounds blended
 * toward that palette's own background) - recomputed per-theme rather than
 * hardcoded, since a template's background color isn't necessarily white/
 * near-black like the two built-in themes.
 */
export interface ResolvedPalette extends Palette {
  primaryTint: string;
  goldTint: string;
}

export function usePalette(variant: "light" | "dark" = "light"): ResolvedPalette {
  const theme = useContext(ThemeCtx);
  const p = variant === "dark" ? theme.dark : theme.light;
  return {
    ...p,
    primaryTint: mix(p.primary, p.background, 0.94),
    goldTint: mix(p.gold, p.background, 0.9),
  };
}
