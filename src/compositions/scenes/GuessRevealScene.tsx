import { Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../../theme/tokens";
import { usePalette } from "../../theme/ThemeContext";
import type { Phrase } from "../../data/phrase";
import { SceneFrame } from "./SceneFrame";
import { computeGuessRevealPhases } from "./guessRevealPhases";

export type GuessRevealField = "phrase" | "translationSi";

/**
 * Generic replacement for the old GuessRevealSceneT2/T3 (two near-duplicate
 * files, preserved on the backup/legacy-composition-renderer branch) -
 * parameterized by which Phrase field plays "prompt" vs "answer" instead of
 * having that choice hardcoded per file. Verified byte-identical against
 * both for the two combos they implemented before being retired - see
 * docs/COMPOSITION_DESIGNER.md.
 *
 * Every visual difference between the old T2/T3 files turned out to be
 * derivable from field identity, not from "which composition" - each field
 * has a fixed "identity" (phrase: sans/foreground/larger, with an optional
 * pronunciation secondary line; translationSi: sinhala/primary/smaller, no
 * secondary), and the answer block's spacing (top offset, card padding/
 * margin/font size) is tighter when the answer field is "phrase" purely
 * because that field's optional pronunciation line adds an extra line above
 * the card - not an arbitrary per-composition tweak. See FIELD_STYLE/
 * ANSWER_LAYOUT below for the exact numbers this was built from.
 */
const FIELD_STYLE: Record<
  GuessRevealField,
  { font: "sans" | "sinhala"; color: "foreground" | "primary"; promptSize: number; answerSize: number; secondarySize: { prompt: number; answer: number } | null }
> = {
  phrase: { font: "sans", color: "foreground", promptSize: 72, answerSize: 54, secondarySize: { prompt: 36, answer: 30 } },
  translationSi: { font: "sinhala", color: "primary", promptSize: 60, answerSize: 48, secondarySize: null },
};

const ANSWER_LAYOUT: Record<GuessRevealField, { top: number; cardPadding: string; cardMarginTop: number; explanationSize: number; explanationSiSize: number }> = {
  translationSi: { top: 1020, cardPadding: "26px 30px", cardMarginTop: 0, explanationSize: 26, explanationSiSize: 24 },
  phrase: { top: 990, cardPadding: "24px 28px", cardMarginTop: 8, explanationSize: 24, explanationSiSize: 22 },
};

function fieldValue(field: GuessRevealField, phrase: Phrase): string | null {
  return field === "phrase" ? phrase.phrase : phrase.translationSi;
}

export function GuessRevealScene({
  phrase,
  index,
  total,
  promptFrames,
  countdownFrames,
  theme = "light",
  promptField,
  answerField,
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
  theme?: "light" | "dark";
  promptField: GuessRevealField;
  answerField: GuessRevealField;
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
  const colors = usePalette(theme);
  const primaryTint = colors.primaryTint;
  const { promptTranslateY, promptScale, ringOpacity, ringProgress, countdownNumber, answerOpacity } =
    computeGuessRevealPhases({ frame, fps, promptFrames, countdownFrames });

  const radius = 110;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - ringProgress);
  const revealStart = promptFrames + countdownFrames;

  const promptStyle = FIELD_STYLE[promptField];
  const answerStyle = FIELD_STYLE[answerField];
  const answerLayout = ANSWER_LAYOUT[answerField];
  const promptText = fieldValue(promptField, phrase);
  const answerText = fieldValue(answerField, phrase);

  return (
    <SceneFrame theme={theme} progress={{ current: index, total }}>
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
              fontFamily: fontFamily[promptStyle.font],
              fontWeight: 700,
              fontSize: promptStyle.promptSize,
              lineHeight: promptStyle.font === "sans" ? 1.2 : 1.3,
              textAlign: "center",
              color: colors[promptStyle.color],
              margin: 0,
            }}
          >
            {promptText}
          </p>
          {promptStyle.secondarySize && phrase.pronunciationSi && (
            <p
              style={{
                fontFamily: fontFamily.sinhala,
                fontSize: promptStyle.secondarySize.prompt,
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
            <text x={130} y={150} textAnchor="middle" fontFamily={fontFamily.sans} fontWeight={700} fontSize={80} fill={colors.primary}>
              {countdownNumber}
            </text>
          </svg>
        </div>

        <div
          style={{
            position: "absolute",
            top: answerLayout.top,
            left: 0,
            right: 0,
            opacity: answerOpacity,
            padding: "0 76px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: answerField === "phrase" ? 16 : 20,
          }}
        >
          {answerText && (
            <p
              style={{
                fontFamily: fontFamily[answerStyle.font],
                fontWeight: 700,
                fontSize: answerStyle.answerSize,
                lineHeight: answerStyle.font === "sans" ? 1.2 : 1.3,
                textAlign: "center",
                color: colors[answerStyle.color],
                margin: 0,
              }}
            >
              {answerText}
            </p>
          )}
          {answerStyle.secondarySize && phrase.pronunciationSi && (
            <p
              style={{
                fontFamily: fontFamily.sinhala,
                fontSize: answerStyle.secondarySize.answer,
                color: colors.mutedForeground,
                textAlign: "center",
                margin: 0,
              }}
            >
              ({phrase.pronunciationSi})
            </p>
          )}
          <div
            style={{
              backgroundColor: primaryTint,
              borderRadius: 24,
              padding: answerLayout.cardPadding,
              display: "flex",
              flexDirection: "column",
              gap: answerField === "phrase" ? 12 : 14,
              width: "100%",
              marginTop: answerLayout.cardMarginTop || undefined,
            }}
          >
            <p style={{ fontFamily: fontFamily.sans, fontSize: answerLayout.explanationSize, lineHeight: 1.4, color: colors.foreground, margin: 0 }}>
              {phrase.explanation}
            </p>
            {phrase.explanationSi && (
              <p
                style={{
                  fontFamily: fontFamily.sinhala,
                  fontSize: answerLayout.explanationSiSize,
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
