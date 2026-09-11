import type { ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { colors, primaryTint, goldTint, darkColors, darkPrimaryTint, darkGoldTint, fontFamily } from "../../theme/tokens";

/**
 * Shared chrome for the phrase/countdown/reveal scenes: soft background
 * accents + a top brand label so the frame doesn't read as a centered
 * slide on empty white, plus optional bottom progress dots showing which
 * phrase (of the batch) is currently on screen. `theme` switches the whole
 * palette for Template 3's dark scenes - defaults to "light" so Template 1/2
 * are unaffected.
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
  const c = theme === "dark" ? darkColors : colors;
  const pTint = theme === "dark" ? darkPrimaryTint : primaryTint;
  const gTint = theme === "dark" ? darkGoldTint : goldTint;

  return (
    <AbsoluteFill style={{ backgroundColor: c.background, overflow: "hidden" }}>
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

      <div style={{ position: "absolute", top: 88, left: 0, right: 0, display: "flex", justifyContent: "center" }}>
        <span
          style={{
            fontFamily: fontFamily.sans,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: 4,
            color: c.mutedForeground,
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
