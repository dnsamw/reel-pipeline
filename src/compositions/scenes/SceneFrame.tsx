import type { ReactNode } from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { fontFamily } from "../../theme/tokens";
import { useTextColor, usePalette, useBackgroundImage, useBackgroundImageScrim } from "../../theme/ThemeContext";

/**
 * Shared chrome for the phrase/countdown/reveal scenes: soft background
 * accents + a top brand label so the frame doesn't read as a centered
 * slide on empty white, plus optional bottom progress dots showing which
 * phrase (of the batch) is currently on screen. `theme` switches the whole
 * palette for Template 3's dark scenes - defaults to "light" so Template 1/2
 * are unaffected. When the template sets a `backgroundImage`
 * (config.backgroundImage, see ThemeContext's useBackgroundImage), it's
 * shown full-bleed with a tinted scrim (using the palette's own background
 * color) in place of the decorative color blobs, so text on top stays
 * readable regardless of which photo is picked.
 */
export function SceneFrame({
  children,
  theme = "light",
  progress,
}: {
  children: ReactNode;
  theme?: "light" | "dark";
  progress?: { current: number; total: number };
}) {
  const c = usePalette(theme);
  const textColor = useTextColor();
  const backgroundImage = useBackgroundImage();
  const backgroundImageScrim = useBackgroundImageScrim();
  const pTint = c.primaryTint;
  const gTint = c.goldTint;

  return (
    <AbsoluteFill style={{ backgroundColor: c.background, overflow: "hidden" }}>
      {backgroundImage ? (
        <>
          <Img
            src={staticFile(backgroundImage)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          {backgroundImageScrim > 0 && <AbsoluteFill style={{ backgroundColor: c.background, opacity: backgroundImageScrim }} />}
        </>
      ) : (
        <>
          <div
            style={{
              position: "absolute",
              top: -180,
              left: -160,
              width: 520,
              height: 520,
              borderRadius: "50%",
              backgroundColor: pTint,
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: -220,
              right: -180,
              width: 560,
              height: 560,
              borderRadius: "50%",
              backgroundColor: gTint,
            }}
          />
        </>
      )}

      <div style={{ position: "absolute", top: 88, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            fontFamily: fontFamily.sans,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: 4,
            color: textColor("header", c.mutedForeground),
            textTransform: "uppercase",
          }}
        >
          StudyPal Phrasebook
        </span>
      </div>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 76px" }}>{children}</AbsoluteFill>

      {progress && (
        <div style={{ position: "absolute", bottom: 100, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14 }}>
          {Array.from({ length: progress.total }).map((_, i) => (
            <div
              key={i}
              style={{
                width: i === progress.current ? 36 : 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: i === progress.current ? c.primary : c.border,
              }}
            />
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
}
