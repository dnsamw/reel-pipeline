// A template's full color set - see ThemeContext.tsx. Shape mirrors `colors`/
// `darkColors` below exactly, so either can be assigned where a Palette is
// expected without conversion.
export interface Palette {
  primary: string;
  brand2: string;
  gold: string;
  goldInk: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  background: string;
}

// Brand palette, ported from ubuntu-node/src/lib/pdf-theme.ts (itself ported
// from the light-theme CSS custom properties in ubuntu-node/src/app/globals.css).
// Same manual-sync caveat applies here: PDF/video renderers can't read CSS
// variables, so these are literal hex values - update alongside the source
// if the brand palette ever changes.
export const colors: Palette = {
  primary: "#58238b",
  brand2: "#9c35b6",
  gold: "#fab005",
  goldInk: "#8f5614",
  foreground: "#09090b",
  mutedForeground: "#6b6470",
  border: "#e4dfec",
  background: "#ffffff",
};

// Exported so ThemeContext.tsx can derive tints for a template's *overridden*
// palette the same way the two constants below are derived for the default one.
export function mix(hex: string, target: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * amount);
  const g = Math.round(ag + (bg - ag) * amount);
  const bl = Math.round(ab + (bb - ab) * amount);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Light tints for card backgrounds/badges, blended toward white - mirrors
// the --primary-tint / --gold-tint custom properties without needing a
// separate hand-converted HSL constant for each.
export const primaryTint = mix(colors.primary, "#ffffff", 0.94);
export const goldTint = mix(colors.gold, "#ffffff", 0.9);

// Dark theme (Template 3), ported the same way from globals.css's `.dark`
// block - HSL custom properties converted to hex since renderers here can't
// read CSS variables. --primary-2 there is brand2's dark counterpart.
export const darkColors: Palette = {
  primary: "#9b52e0",
  brand2: "#c262da",
  gold: "#fbc851",
  goldInk: "#f9d286",
  foreground: "#f5f5f5",
  mutedForeground: "#a9a7b4",
  border: "#332b3b",
  background: "#150f1a",
};

export const darkPrimaryTint = mix(darkColors.primary, darkColors.background, 0.94);
export const darkGoldTint = mix(darkColors.gold, darkColors.background, 0.9);

export const fontFamily = {
  sans: "Poppins",
  sinhala: "Noto Sans Sinhala",
} as const;
