import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily } from "../../../theme/tokens";
import { usePalette, type ResolvedPalette } from "../../../theme/ThemeContext";
import type { ReelConfig } from "../../../config/config";
import type { Phrase } from "../../../data/phrase";
import type { ColorRef, CustomBeat, Layer, TextRef } from "./schema";

/**
 * Phase 1 of docs/COMPOSITION_DESIGNER.md's "concrete design for the true
 * visual designer": a generic interpreter for the DRAFT `CustomBeat`/`Layer`
 * schema (./schema.ts) - proves a beat's visual content can be pure data,
 * not a hand-written scene component. Registered standalone as Root.tsx's
 * "LayerDesignerPOC" composition; not wired into the production beat system
 * (beatSchema/CompositionFromRecipe.tsx) yet - see the doc for the phased
 * plan this is phase 1 of.
 */

const anchorOffset: Record<Layer["box"]["anchor"], [number, number]> = {
  "top-left": [0, 0],
  "top-center": [50, 0],
  "top-right": [100, 0],
  "center-left": [0, 50],
  center: [50, 50],
  "center-right": [100, 50],
  "bottom-left": [0, 100],
  "bottom-center": [50, 100],
  "bottom-right": [100, 100],
};

function resolveColor(ref: ColorRef | undefined, c: ResolvedPalette, opposite: ResolvedPalette): string | undefined {
  if (!ref) return undefined;
  if (ref.source === "literal") return ref.hex;
  if (ref.source === "theme") return c[ref.token];
  return opposite[ref.token];
}

function resolveText(ref: TextRef, phrase: Phrase | null, config: ReelConfig): string {
  if (ref.source === "literal") return ref.value;
  if (ref.source === "config") return config.introText;
  return (phrase?.[ref.field] ?? "") as string;
}

type AnimationStep = CustomBeat["layers"][number]["animation"]["enter"];

function stepDuration(step: AnimationStep, fps: number): number {
  return "durationInFrames" in step ? step.durationInFrames : Math.round(fps / 2);
}

/** Fraction (0-1) an enter/exit animation has progressed through, given the beat's local frame. */
function animationProgress(frame: number, fps: number, step: AnimationStep, delayFrames: number) {
  const local = frame - delayFrames;
  if (step.type === "none" || local < 0) return { fraction: local < 0 ? 0 : 1, spring: 0 };
  const durationInFrames = stepDuration(step, fps);
  const fraction = interpolate(local, [0, durationInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const springValue = spring({ frame: local, fps, config: { damping: 200 } });
  return { fraction, spring: springValue };
}

function LayerView({
  layer,
  frame,
  fps,
  c,
  opposite,
  phrase,
  config,
  beatDurationInFrames,
}: {
  layer: Layer;
  frame: number;
  fps: number;
  c: ResolvedPalette;
  opposite: ResolvedPalette;
  phrase: Phrase | null;
  config: ReelConfig;
  beatDurationInFrames: number;
}) {
  const { box, animation } = layer;
  const [ox, oy] = anchorOffset[box.anchor];

  const enter = animationProgress(frame, fps, animation.enter, animation.delayFrames);
  const framesFromEnd = beatDurationInFrames - frame;
  const exitStart = beatDurationInFrames - (animation.exit.type === "none" ? 0 : stepDuration(animation.exit, fps));
  const exit = frame >= exitStart ? animationProgress(framesFromEnd, fps, animation.exit, 0) : { fraction: 0, spring: 0 };

  let opacity = 1;
  let extraTransform = "";
  if (animation.enter.type === "fade") opacity *= enter.fraction;
  if (animation.enter.type === "scaleSpring") extraTransform += ` scale(${interpolate(enter.spring, [0, 1], [animation.enter.fromScale ?? 0.8, 1])})`;
  if (animation.enter.type === "slide") {
    const dist = 120;
    const [dx, dy] =
      animation.enter.from === "left" ? [-dist, 0] : animation.enter.from === "right" ? [dist, 0] : animation.enter.from === "top" ? [0, -dist] : [0, dist];
    const remain = 1 - enter.fraction;
    extraTransform += ` translate(${dx * remain}px, ${dy * remain}px)`;
  }
  if (animation.exit.type === "fade") opacity *= 1 - exit.fraction;

  const style: React.CSSProperties = {
    position: "absolute",
    left: `${box.position.xPct}%`,
    top: `${box.position.yPct}%`,
    width: box.widthPct != null ? `${box.widthPct}%` : undefined,
    height: box.heightPct != null ? `${box.heightPct}%` : undefined,
    zIndex: box.zIndex,
    opacity,
    transform: `translate(-${ox}%, -${oy}%) rotate(${box.rotationDeg}deg)${extraTransform}`,
  };

  if (layer.kind === "text") {
    return (
      <div
        style={{
          ...style,
          fontFamily: layer.font === "sinhala" ? fontFamily.sinhala : fontFamily.sans,
          fontWeight: layer.fontWeight,
          fontSize: layer.fontSizePx,
          color: resolveColor(layer.color, c, opposite),
          textAlign: layer.align,
          whiteSpace: "pre-wrap",
        }}
      >
        {resolveText(layer.text, phrase, config)}
      </div>
    );
  }

  if (layer.kind === "shape") {
    const fill = resolveColor(layer.fill, c, opposite);
    if (layer.shape === "ring") {
      const radius = 130;
      const circumference = 2 * Math.PI * radius;
      // No real countdown state in this POC - demo the binding by tying it to the beat's own timeline.
      const progress = layer.progress ? interpolate(frame, [0, beatDurationInFrames], [0, 1], { extrapolateRight: "clamp" }) : 1;
      return (
        <div style={style}>
          <svg width={radius * 2 + 20} height={radius * 2 + 20} viewBox={`0 0 ${radius * 2 + 20} ${radius * 2 + 20}`}>
            <circle cx={radius + 10} cy={radius + 10} r={radius} fill="none" stroke={resolveColor(layer.stroke, c, opposite) ?? c.border} strokeWidth={layer.strokeWidthPx ?? 14} />
            <circle
              cx={radius + 10}
              cy={radius + 10}
              r={radius}
              fill="none"
              stroke={fill ?? c.gold}
              strokeWidth={layer.strokeWidthPx ?? 14}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              transform={`rotate(-90 ${radius + 10} ${radius + 10})`}
            />
          </svg>
        </div>
      );
    }
    return (
      <div
        style={{
          ...style,
          backgroundColor: fill,
          border: layer.stroke ? `${layer.strokeWidthPx ?? 2}px solid ${resolveColor(layer.stroke, c, opposite)}` : undefined,
          borderRadius: layer.shape === "circle" ? "50%" : layer.cornerRadiusPx,
        }}
      />
    );
  }

  // image
  if (layer.src.source === "sceneFrameChrome") {
    // A self-contained fragment matching SceneFrame.tsx's two background
    // blobs - ignores this layer's own box, since the chrome is a whole
    // background unit, not a single positioned element.
    return (
      <>
        <div style={{ position: "absolute", top: -180, left: -160, width: 520, height: 520, borderRadius: "50%", backgroundColor: c.primaryTint, zIndex: box.zIndex }} />
        <div style={{ position: "absolute", bottom: -220, right: -180, width: 560, height: 560, borderRadius: "50%", backgroundColor: c.goldTint, zIndex: box.zIndex }} />
      </>
    );
  }
  return null; // asset images: not exercised by the POC beat, would use remotion's <Img src={staticFile(...)} />
}

export function LayerRenderer({ beat, phrase = null, config }: { beat: CustomBeat; phrase?: Phrase | null; config: ReelConfig }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const light = usePalette("light");
  const dark = usePalette("dark");
  const c = beat.theme === "dark" ? dark : light;
  const opposite = beat.theme === "dark" ? light : dark;

  const sorted = [...beat.layers].sort((a, b) => a.box.zIndex - b.box.zIndex);

  return (
    <AbsoluteFill style={{ backgroundColor: c.background, overflow: "hidden" }}>
      {sorted.map((layer) => (
        <LayerView key={layer.id} layer={layer} frame={frame} fps={fps} c={c} opposite={opposite} phrase={phrase} config={config} beatDurationInFrames={beat.durationInFrames} />
      ))}
    </AbsoluteFill>
  );
}
