import { Html5Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../../theme/tokens";
import { usePalette } from "../../theme/ThemeContext";
import type { Phrase } from "../../data/phrase";
import { SceneFrame } from "./SceneFrame";

export function RevealScene({
  phrase,
  index,
  total,
  revealSoundFile,
  revealSoundVolume,
  ttsFile,
  ttsVolume,
}: {
  phrase: Phrase;
  index: number;
  total: number;
  revealSoundFile: string | null;
  revealSoundVolume: number;
  ttsFile: string | null;
  ttsVolume: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const scale = interpolate(enter, [0, 1], [0.92, 1]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const colors = usePalette("light");

  return (
    <SceneFrame progress={{ current: index, total }}>
      {revealSoundFile && <Html5Audio src={staticFile(`sfx/${revealSoundFile}`)} volume={revealSoundVolume} />}
      {ttsFile && <Html5Audio src={staticFile(`tts/${ttsFile}`)} volume={ttsVolume} />}
      <div
        style={{
          opacity,
          transform: `scale(${scale})`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
          width: "100%",
        }}
      >
        {phrase.translationSi && (
          <p
            style={{
              fontFamily: fontFamily.sinhala,
              fontWeight: 700,
              fontSize: 64,
              lineHeight: 1.3,
              textAlign: "center",
              color: colors.primary,
              margin: 0,
            }}
          >
            {phrase.translationSi}
          </p>
        )}
        <div
          style={{
            backgroundColor: colors.primaryTint,
            borderRadius: 28,
            padding: "34px 38px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
            width: "100%",
          }}
        >
          <p style={{ fontFamily: fontFamily.sans, fontSize: 32, lineHeight: 1.45, color: colors.foreground, margin: 0 }}>
            {phrase.explanation}
          </p>
          {phrase.explanationSi && (
            <p
              style={{
                fontFamily: fontFamily.sinhala,
                fontSize: 30,
                lineHeight: 1.5,
                color: colors.foreground,
                margin: 0,
              }}
            >
              {phrase.explanationSi}
            </p>
          )}
        </div>
      </div>
    </SceneFrame>
  );
}
