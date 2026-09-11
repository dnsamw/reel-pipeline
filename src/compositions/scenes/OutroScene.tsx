import { AbsoluteFill } from "remotion";
import { colors, darkColors, fontFamily } from "../../theme/tokens";

// Same path data as ubuntu-node/src/components/brand/Logo.tsx and
// ubuntu-node/src/lib/pdf-theme.ts's logoIconPath - kept in sync manually
// since this renderer needs its own <svg> element rather than a shared one.
const logoIconPath =
  "M87.787 36.736a20.05 20.05 0 0 0-14.263-5.912 20.05 20.05 0 0 0-14.264 5.912L36.034 59.962a12.59 12.59 0 0 1-8.962 3.707 12.55 12.55 0 0 1-8.952-3.717A12.53 12.53 0 0 1 14.404 51c0-3.378 1.314-6.56 3.716-8.962a12.58 12.58 0 0 1 8.952-3.707 12.58 12.58 0 0 1 8.962 3.707l5.463 5.464 4.961-.46.342-4.842-5.464-5.464a20.05 20.05 0 0 0-14.264-5.912 20.05 20.05 0 0 0-14.264 5.912C8.998 40.546 6.896 45.613 6.896 51s2.102 10.452 5.912 14.265a20.05 20.05 0 0 0 14.264 5.911 20.05 20.05 0 0 0 14.264-5.911l23.226-23.227a12.59 12.59 0 0 1 8.963-3.707c3.378 0 6.56 1.313 8.952 3.707 4.944 4.945 4.944 12.979 0 17.924a12.58 12.58 0 0 1-8.952 3.707 12.59 12.59 0 0 1-8.963-3.707L58.301 53.7l-.342 4.842-4.961.46-.045-.045v.001l6.308 6.307a20.05 20.05 0 0 0 14.264 5.911 20.05 20.05 0 0 0 14.263-5.911c7.862-7.866 7.862-20.665-.001-28.529";
const logoViewBox = "3 28 95 46";

/**
 * `theme` picks which palette the outro renders in - independent of the
 * scenes before it, since the outro is meant to contrast: Template 1/2 (light
 * main scenes) use theme="dark" here, Template 3 (dark main scenes) uses
 * theme="light" for the same contrast effect in reverse.
 */
export function OutroScene({ ctaUrl, theme = "dark" }: { ctaUrl: string; theme?: "light" | "dark" }) {
  const isDark = theme === "dark";
  const bg = isDark ? colors.primary : colors.background;
  const accent = isDark ? colors.brand2 : darkColors.primary;
  const accentOpacity = isDark ? [0.45, 0.35] : [0.12, 0.08];
  const logoTileBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(88,35,139,0.08)";
  const logoFill = isDark ? colors.background : colors.primary;
  const headingColor = isDark ? colors.background : colors.foreground;
  const subColor = isDark ? "rgba(255,255,255,0.85)" : colors.mutedForeground;
  const pillBg = colors.gold;
  const pillTextColor = colors.goldInk;

  return (
    <AbsoluteFill style={{ backgroundColor: bg, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 620,
          height: 620,
          borderRadius: "50%",
          backgroundColor: accent,
          opacity: accentOpacity[0],
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -240,
          left: -220,
          width: 640,
          height: 640,
          borderRadius: "50%",
          backgroundColor: accent,
          opacity: accentOpacity[1],
        }}
      />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 44 }}>
          <div
            style={{
              width: 180,
              height: 120,
              borderRadius: 32,
              backgroundColor: logoTileBg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width={120} height={80} viewBox={logoViewBox}>
              <path d={logoIconPath} fill={logoFill} />
            </svg>
          </div>
          <p
            style={{
              fontFamily: fontFamily.sans,
              fontWeight: 700,
              fontSize: 58,
              lineHeight: 1.25,
              color: headingColor,
              textAlign: "center",
              margin: 0,
            }}
          >
            Get the full phrasebook
          </p>
          <p
            style={{
              fontFamily: fontFamily.sans,
              fontSize: 30,
              color: subColor,
              textAlign: "center",
              margin: 0,
              maxWidth: 620,
            }}
          >
            200+ everyday English phrases with Sinhala pronunciation &amp; meaning
          </p>
          <div
            style={{
              marginTop: 8,
              padding: "18px 44px",
              borderRadius: 999,
              backgroundColor: pillBg,
            }}
          >
            <p style={{ fontFamily: fontFamily.sans, fontWeight: 700, fontSize: 34, color: pillTextColor, margin: 0 }}>
              {ctaUrl}
            </p>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
