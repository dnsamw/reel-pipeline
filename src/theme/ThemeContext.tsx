import { createContext, useContext, type ReactNode } from "react";
import { colors, darkColors, mix, type Palette } from "./tokens";
import type { TextColorKey } from "./textColors";
import { RANDOM_BACKGROUND_IMAGE } from "../config/config";

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

interface ThemeCtxValue {
  theme: ReelTheme;
  /** Filename under assets/background-images, or null for the plain palette background - see config.ts's backgroundImage. */
  backgroundImage: string | null;
  /** Opacity of the tint drawn over backgroundImage - see config.ts's backgroundImageScrim. */
  backgroundImageScrim: number;
  /** Per-text-element color overrides - see config.ts's textColors. */
  textColors: Record<string, string | null> | null;
  /** Override for the outro scene's background - see config.ts's outroBackgroundColor. */
  outroBackgroundColor: string | null;
  /** Override for the outro scene's decorative circles - see config.ts's outroAccentColor. */
  outroAccentColor: string | null;
}

const ThemeCtx = createContext<ThemeCtxValue>({
  theme: defaultTheme,
  backgroundImage: null,
  backgroundImageScrim: 0.55,
  textColors: null,
  outroBackgroundColor: null,
  outroAccentColor: null,
});

/**
 * Wraps a whole Reel/ReelTemplate2/ReelTemplate3 render tree so every scene
 * underneath reads the same palette (and background image) without each one
 * needing those threaded through render props - only the composition root
 * needs to know about `config.theme`/`config.backgroundImage`.
 */
export function ThemeProvider({
  theme,
  backgroundImage = null,
  backgroundImageScrim = 0.55,
  textColors = null,
  outroBackgroundColor = null,
  outroAccentColor = null,
  children,
}: {
  theme: ReelTheme | null;
  backgroundImage?: string | null;
  backgroundImageScrim?: number;
  textColors?: Record<string, string | null> | null;
  outroBackgroundColor?: string | null;
  outroAccentColor?: string | null;
  children: ReactNode;
}) {
  return (
    <ThemeCtx.Provider
      value={{
        theme: theme ?? defaultTheme,
        // An unresolved "random" (e.g. in Remotion Studio) has no file behind it - show the plain background instead.
        backgroundImage: backgroundImage === RANDOM_BACKGROUND_IMAGE ? null : backgroundImage,
        backgroundImageScrim, textColors, outroBackgroundColor, outroAccentColor }}
    >
      {children}
    </ThemeCtx.Provider>
  );
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
  const { theme } = useContext(ThemeCtx);
  const p = variant === "dark" ? theme.dark : theme.light;
  return {
    ...p,
    primaryTint: mix(p.primary, p.background, 0.94),
    goldTint: mix(p.gold, p.background, 0.9),
  };
}

/** The current template's full-bleed background image filename (under assets/background-images), or null - see SceneFrame.tsx. */
export function useBackgroundImage(): string | null {
  return useContext(ThemeCtx).backgroundImage;
}

/** Opacity (0-1) of the tint drawn over the background image - see SceneFrame.tsx. */
export function useBackgroundImageScrim(): number {
  return useContext(ThemeCtx).backgroundImageScrim;
}

/**
 * Returns a lookup for the template's per-text-element color overrides (see
 * textColors.ts) - `textColor("phrase", colors.foreground)` gives the
 * template's color for that text, or the passed palette color if it has none.
 */
export function useTextColor(): (key: TextColorKey, fallback: string) => string {
  const { textColors } = useContext(ThemeCtx);
  return (key, fallback) => textColors?.[key] || fallback;
}

/** The template's outro background color override, or null to keep the palette color - see OutroScene.tsx. */
export function useOutroBackgroundColor(): string | null {
  return useContext(ThemeCtx).outroBackgroundColor;
}

/** The template's outro decorative-circle color override, or null to keep the palette color - see OutroScene.tsx. */
export function useOutroAccentColor(): string | null {
  return useContext(ThemeCtx).outroAccentColor;
}
