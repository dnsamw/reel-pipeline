import type { CSSProperties, JSX } from "react";
import { hexToRgba, mixHex } from "./PostReady";

/**
 * Optional "3D background" (Vocab Post and Basic -> Advanced): a lit, vignetted backdrop,
 * a perspective floor grid fading into the distance and a few glossy spheres
 * tucked into the edges - all derived from the post's own colors so it works
 * with any palette. Sits behind everything; the rows stay on the plain area.
 */
export function Background3D({ width, height, bg, line, accentA, accentB }: { width: number; height: number; bg: string; line: string; accentA: string; accentB: string }) {
  const fill: CSSProperties = { position: "absolute", inset: 0 };
  const sphere = (size: number, color: string, pos: CSSProperties): JSX.Element => (
    <div style={{ position: "absolute", width: size, height: size, ...pos }}>
      {/* Soft contact shadow under the ball */}
      <div
        style={{
          position: "absolute",
          left: "10%",
          right: "10%",
          bottom: -size * 0.12,
          height: size * 0.18,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, ${hexToRgba("#000000", 0.35)} 0%, transparent 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `radial-gradient(circle at 32% 28%, ${mixHex(color, "#ffffff", 0.75)} 0%, ${color} 38%, ${mixHex(color, "#000000", 0.45)} 100%)`,
          boxShadow: `0 ${size * 0.08}px ${size * 0.2}px ${hexToRgba("#000000", 0.25)}`,
        }}
      />
    </div>
  );
  return (
    <div style={{ ...fill, overflow: "hidden", pointerEvents: "none" }}>
      {/* Light from the top-left, darker toward the edges */}
      <div
        style={{
          ...fill,
          background: `radial-gradient(ellipse 90% 70% at 30% 18%, ${hexToRgba(mixHex(bg, "#ffffff", 0.6), 0.75)} 0%, transparent 60%), radial-gradient(ellipse 120% 90% at 50% 45%, transparent 55%, ${hexToRgba(mixHex(bg, "#000000", 0.5), 0.55)} 100%)`,
        }}
      />
      {/* Floor grid tilted away from the viewer, fading out toward the horizon */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: height * 0.42, perspective: height * 0.5, perspectiveOrigin: "50% 0%" }}>
        <div
          style={{
            position: "absolute",
            left: -width,
            right: -width,
            top: 0,
            height: height * 1.2,
            transform: "rotateX(62deg)",
            transformOrigin: "50% 0%",
            backgroundImage: `linear-gradient(${line} 2px, transparent 2px), linear-gradient(90deg, ${line} 2px, transparent 2px)`,
            backgroundSize: `${width / 9}px ${width / 9}px`,
            backgroundPosition: "center top",
            WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
            maskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
          }}
        />
      </div>
      {/* Corners only - the centered title and logo leave them free, so no sphere sits under a word. */}
      {sphere(width * 0.26, accentA, { right: -width * 0.13, top: -width * 0.13 })}
      {sphere(width * 0.14, accentB, { left: -width * 0.06, bottom: -width * 0.04 })}
      {sphere(width * 0.07, accentA, { right: width * 0.06, bottom: height * 0.035 })}
    </div>
  );
}
