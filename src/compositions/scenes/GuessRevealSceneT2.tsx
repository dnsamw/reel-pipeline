import { Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../../theme/tokens";
import { usePalette } from "../../theme/ThemeContext";
import type { Phrase } from "../../data/phrase";
import { SceneFrame } from "./SceneFrame";
import { computeGuessRevealPhases } from "./guessRevealPhases";

/**
 * Template 2's per-phrase unit: one continuously-mounted scene (not three
 * separate cut Sequences like Template 1) so the phrase can visually persist
 * and pin up while the countdown runs in place below it, then swap to the
 * Sinhala reveal in the same spot - phrase and meaning end up on screen
 * together.
 */
export function GuessRevealSceneT2({
  phrase,
  index,
  total,
  promptFrames,
  countdownFrames,
  tickFile,
  tickVolume,
  revealSoundFile,
  revealSoundVolume,
  promptTtsFile,
  promptTtsVolume,
  answerTtsFile,
  answerTtsVolume,
}: {
  phrase: Phrase;
  index: number;
  total: number;
  promptFrames: number;
  countdownFrames: number;
  tickFile: string | null;
  tickVolume: number;
  revealSoundFile: string | null;
  revealSoundVolume: number;
  promptTtsFile: string | null;
  promptTtsVolume: number;
  answerTtsFile: string | null;
  answerTtsVolume: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = usePalette("light");
  const primaryTint = colors.primaryTint;
  const { promptTranslateY, promptScale, ringOpacity, ringProgress, countdownNumber, answerOpacity } =
    computeGuessRevealPhases({ frame, fps, promptFrames, countdownFrames });

  const radius = 110;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - ringProgress);
  const revealStart = promptFrames + countdownFrames;

  return (
    <SceneFrame progress={{ current: index, total }}>
      {promptTtsFile && <Html5Audio src={staticFile(`tts/${promptTtsFile}`)} volume={promptTtsVolume} />}
      {tickFile && (
        <Sequence from={promptFrames} durationInFrames={countdownFrames}>
          <Html5Audio src={staticFile(`sfx/${tickFile}`)} volume={tickVolume} />
        </Sequence>
      )}
      {revealSoundFile && (
        <Sequence from={revealStart}>
          <Html5Audio src={staticFile(`sfx/${revealSoundFile}`)} volume={revealSoundVolume} />
        </Sequence>
      )}
      {answerTtsFile && (
        <Sequence from={revealStart}>
          <Html5Audio src={staticFile(`tts/${answerTtsFile}`)} volume={answerTtsVolume} />
        </Sequence>
      )}

      <div style={{ position: "relative", width: "100%", height: "100%" }}>
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: 0,
            right: 0,
            transform: `translateY(calc(-50% + ${promptTranslateY}px)) scale(${promptScale})`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 24,
            padding: "0 76px",
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: primaryTint,
              color: colors.primary,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fontFamily.sans,
              fontWeight: 700,
              fontSize: 28,
            }}
          >
            {index + 1}
          </div>
          <p
            style={{
              fontFamily: fontFamily.sans,
              fontWeight: 700,
              fontSize: 72,
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
                fontSize: 36,
                color: colors.mutedForeground,
                textAlign: "center",
                margin: 0,
              }}
            >
              ({phrase.pronunciationSi})
            </p>
          )}
        </div>

        <div
          style={{
            position: "absolute",
            top: 1180,
            left: 0,
            right: 0,
            opacity: ringOpacity,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <svg width={260} height={260} viewBox="0 0 260 260">
            <circle cx={130} cy={130} r={radius} fill="none" stroke={colors.border} strokeWidth={12} />
            <circle
              cx={130}
              cy={130}
              r={radius}
              fill="none"
              stroke={colors.gold}
              strokeWidth={12}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashoffset}
              transform="rotate(-90 130 130)"
            />
            <text
              x={130}
              y={150}
              textAnchor="middle"
              fontFamily={fontFamily.sans}
              fontWeight={700}
              fontSize={80}
              fill={colors.primary}
            >
              {countdownNumber}
            </text>
          </svg>
        </div>

        <div
          style={{
            position: "absolute",
            top: 1020,
            left: 0,
            right: 0,
            opacity: answerOpacity,
            padding: "0 76px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 20,
          }}
        >
          {phrase.translationSi && (
            <p
              style={{
                fontFamily: fontFamily.sinhala,
                fontWeight: 700,
                fontSize: 48,
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
              backgroundColor: primaryTint,
              borderRadius: 24,
              padding: "26px 30px",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              width: "100%",
            }}
          >
            <p style={{ fontFamily: fontFamily.sans, fontSize: 26, lineHeight: 1.4, color: colors.foreground, margin: 0 }}>
              {phrase.explanation}
            </p>
            {phrase.explanationSi && (
              <p
                style={{
                  fontFamily: fontFamily.sinhala,
                  fontSize: 24,
                  lineHeight: 1.45,
                  color: colors.foreground,
                  margin: 0,
                }}
              >
                {phrase.explanationSi}
              </p>
            )}
          </div>
        </div>
      </div>
    </SceneFrame>
  );
}
