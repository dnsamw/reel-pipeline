import { Html5Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { colors, primaryTint, darkColors, darkPrimaryTint, fontFamily } from "../../theme/tokens";
import { SceneFrame } from "./SceneFrame";

export function IntroScene({
  text,
  voiceFile,
  voiceVolume,
  theme = "light",
}: {
  text: string;
  voiceFile: string | null;
  voiceVolume: number;
  theme?: "light" | "dark";
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(enter, [0, 1], [0.85, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const c = theme === "dark" ? darkColors : colors;
  const pTint = theme === "dark" ? darkPrimaryTint : primaryTint;

  return (
    <SceneFrame theme={theme}>
      {voiceFile && <Html5Audio src={staticFile(`voice/${voiceFile}`)} volume={voiceVolume} />}
      <div style={{ opacity, transform: `scale(${scale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 }}>
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: "50%",
            backgroundColor: pTint,
            color: c.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: fontFamily.sans,
            fontWeight: 700,
            fontSize: 80,
          }}
        >
          ?
        </div>
        <p
          style={{
            fontFamily: fontFamily.sinhala,
            fontWeight: 700,
            fontSize: 58,
            lineHeight: 1.35,
            textAlign: "center",
            color: c.foreground,
            margin: 0,
            maxWidth: 820,
          }}
        >
          {text}
        </p>
      </div>
    </SceneFrame>
  );
}
