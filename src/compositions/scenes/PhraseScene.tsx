import { Html5Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../../theme/tokens";
import { usePalette } from "../../theme/ThemeContext";
import type { Phrase } from "../../data/phrase";
import { SceneFrame } from "./SceneFrame";

export function PhraseScene({
  phrase,
  index,
  total,
  ttsFile,
  ttsVolume,
}: {
  phrase: Phrase;
  index: number;
  total: number;
  ttsFile: string | null;
  ttsVolume: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 200 } });
  const translateY = interpolate(enter, [0, 1], [24, 0]);
  const opacity = interpolate(enter, [0, 1], [0, 1]);
  const colors = usePalette("light");

  return (
    <SceneFrame progress={{ current: index, total }}>
      {ttsFile && <Html5Audio src={staticFile(`tts/${ttsFile}`)} volume={ttsVolume} />}
      <div
        style={{
          opacity,
          transform: `translateY(${translateY}px)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 36,
          width: "100%",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            backgroundColor: colors.primaryTint,
            color: colors.primary,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: fontFamily.sans,
            fontWeight: 700,
            fontSize: 32,
          }}
        >
          {index + 1}
        </div>
        <p
          style={{
            fontFamily: fontFamily.sans,
            fontWeight: 700,
            fontSize: 86,
            lineHeight: 1.2,
            textAlign: "center",
            color: colors.foreground,
            margin: 0,
          }}
        >
          {phrase.phrase}
        </p>
        {phrase.pronunciationSi && (
          <p
            style={{
              fontFamily: fontFamily.sinhala,
              fontSize: 42,
              color: colors.mutedForeground,
              textAlign: "center",
              margin: 0,
            }}
          >
            ({phrase.pronunciationSi})
          </p>
        )}
      </div>
    </SceneFrame>
  );
}
