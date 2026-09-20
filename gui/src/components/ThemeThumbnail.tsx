import type { Palette, ReelTheme } from "../types";

function ThemeThumbnail({ palette, label }: { palette: Palette; label: string }) {
  return (
    <div className="theme-thumb" style={{ background: palette.background, color: palette.foreground }}>
      <span className="theme-thumb-label" style={{ color: palette.mutedForeground }}>
        {label}
      </span>
      <span className="theme-thumb-badge" style={{ background: palette.primary }} />
      <span className="theme-thumb-pill" style={{ background: palette.gold, color: palette.goldInk }}>
        CTA
      </span>
    </div>
  );
}

/** Static color swatches, not a real render - for "does this look roughly right" at a glance in the template list. See gui/src/pages/TemplateEditor.tsx's ReelPreview for the real thing. */
export function ThemePreviewPair({ theme }: { theme: ReelTheme }) {
  return (
    <div className="theme-thumb-pair">
      <ThemeThumbnail palette={theme.light} label="Light" />
      <ThemeThumbnail palette={theme.dark} label="Dark" />
    </div>
  );
}
