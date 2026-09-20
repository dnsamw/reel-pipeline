import { AbsoluteFill } from "remotion";
import { logoIconPath, logoViewBox } from "./OutroScene";

/**
 * Persistent branding bug shown in a corner across the whole reel - unlike
 * SceneFrame's top-center "StudyPal Phrasebook" label (which only covers the
 * guessReveal/intro scenes), this renders once at the ReelTemplate3 level so
 * it stays on screen through transitions and the outro too. The dark
 * translucent tile keeps the mark legible over both the dark main scenes and
 * the light outro without needing a theme prop.
 */
export function Watermark() {
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 56,
          right: 56,
          width: 72,
          height: 72,
          borderRadius: "50%",
          backgroundColor: "rgba(0,0,0,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={40} height={27} viewBox={logoViewBox}>
          <path d={logoIconPath} fill="#ffffff" />
        </svg>
      </div>
    </AbsoluteFill>
  );
}
