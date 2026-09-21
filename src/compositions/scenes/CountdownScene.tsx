import { Html5Audio, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../../theme/tokens";
import { usePalette } from "../../theme/ThemeContext";
import { SceneFrame } from "./SceneFrame";

/**
 * A generic ring countdown, driven entirely by frame/duration - no
 * per-phrase data, so it's just a reusable component composed into every
 * reel rather than a pre-rendered clip asset. The digit count scales with
 * duration (e.g. 5,4,3,2,1 for a 5s countdown) so changing
 * config.countdownSeconds doesn't need a matching code change here.
 */
export function CountdownScene({
  durationInFrames,
  index,
  total,
  tickFile,
  tickVolume,
}: {
  durationInFrames: number;
  index: number;
  total: number;
  tickFile: string | null;
  tickVolume: number;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const colors = usePalette("light");
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], { extrapolateRight: "clamp" });

  const steps = Math.max(1, Math.round(durationInFrames / fps));
  const segment = durationInFrames / steps;
  const number = steps - Math.min(steps - 1, Math.floor(frame / segment));

  const radius = 130;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - progress);

  return (
    <SceneFrame progress={{ current: index, total }}>
      {/* ClockTicking.mp3 is a continuous ambience track, not a per-number
          blip - play it once for the whole countdown; it's naturally cut
          off when this Sequence ends. */}
      {tickFile && <Html5Audio src={staticFile(`sfx/${tickFile}`)} volume={tickVolume} />}
      <svg width={300} height={300} viewBox="0 0 300 300">
        <circle cx={150} cy={150} r={radius} fill="none" stroke={colors.border} strokeWidth={14} />
        <circle
          cx={150}
          cy={150}
          r={radius}
          fill="none"
          stroke={colors.gold}
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform="rotate(-90 150 150)"
        />
        <text
          x={150}
          y={175}
          textAnchor="middle"
          fontFamily={fontFamily.sans}
          fontWeight={700}
          fontSize={100}
          fill={colors.primary}
        >
          {number}
        </text>
      </svg>
    </SceneFrame>
  );
}
