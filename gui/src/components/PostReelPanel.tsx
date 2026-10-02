import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { api } from "../api";
import { PublishPanel } from "./PublishPanel";
import { postCaptionContext, suggestPostCaption } from "../lib/postCaption";
import type { CaptionContext } from "../types";
import type { PostColors, PostFields, PostLists, PostTemplateDef } from "../../../src/posts/types";

type Track = { file: string; durationSeconds: number | null };

export interface ReelSettings {
  durationSeconds: number;
  musicFile: string;
  musicStartSeconds: number;
  musicVolume: number;
  frame: "reel" | "original";
}

const DEFAULTS: ReelSettings = { durationSeconds: 15, musicFile: "", musicStartSeconds: 0, musicVolume: 0.8, frame: "reel" };

function readSettings(key: string): ReelSettings {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** The ReelSettings a request sends - "" (no music) becomes null. */
export type ReelRequest = Omit<ReelSettings, "musicFile"> & { musicFile: string | null };

/**
 * "Export as reel" for the Post Creator: the current post as a static-image
 * MP4 over a chosen background track (server/postReel.ts), plus the publish
 * panel for the result.
 */
export function PostReelPanel({
  def,
  fields,
  lists,
  colors,
  onError,
  safeZones,
}: {
  def: PostTemplateDef;
  fields: PostFields;
  lists: PostLists;
  colors: PostColors;
  onError: (message: string | null) => void;
  safeZones: boolean;
}) {
  return (
    <StillReelPanel<{ caption: string; context: CaptionContext }>
      width={def.width}
      height={def.height}
      settingsKey="studypal-reels:post-creator:reel-settings"
      snapshot={JSON.stringify({ id: def.id, fields, lists, colors, safeZones })}
      fallbackFilename={`${def.id}.mp4`}
      description="This post as a still-image video with background music."
      onError={onError}
      exportReel={async (reel) => {
        const { blob, savedPath } = await api.renderPostReel({ templateId: def.id, fields, lists, colors, safeZones, reel });
        return { blob, savedPath, extra: { caption: suggestPostCaption(def, fields, lists), context: postCaptionContext(def, fields, lists, "reel") } };
      }}
      renderResult={(r) => (
        <PublishPanel source={{ type: "post", savedPath: r.savedPath }} fallbackCaption={r.extra.caption} captionContext={r.extra.context} kind="reel" stale={r.stale} previewUrl={r.url} />
      )}
    />
  );
}

/**
 * A still (post or ad) as an MP4 over a chosen background track. Tracks come
 * from assets/music and can be auditioned here - Vite serves assets/ as the
 * GUI's publicDir, so /music/<file> plays directly without an API round trip.
 * `exportReel` does the render; `renderResult` adds anything under the
 * finished video (Post Creator's publish panel).
 */
export function StillReelPanel<T = undefined>({
  width,
  height,
  settingsKey,
  snapshot: contentSnapshot,
  fallbackFilename,
  title = "Reel (MP4)",
  description,
  exportReel,
  renderResult,
  onError,
}: {
  width: number;
  height: number;
  /** localStorage key the reel settings are remembered under. */
  settingsKey: string;
  /** Identity of the content being exported - a change marks the last result stale. */
  snapshot: string;
  fallbackFilename: string;
  title?: string;
  description: string;
  exportReel: (reel: ReelRequest) => Promise<{ blob: Blob; savedPath: string; extra: T }>;
  renderResult?: (result: { url: string; savedPath: string; stale: boolean; extra: T }) => ReactNode;
  onError: (message: string | null) => void;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [settings, setSettings] = useState<ReelSettings>(() => readSettings(settingsKey));
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [result, setResult] = useState<{ url: string; savedPath: string; filename: string; snapshot: string; extra: T } | null>(null);

  // What the reel was made from (content + reel settings) - compared to
  // warn that publishing would post an out-of-date file.
  const snapshot = JSON.stringify({ contentSnapshot, settings });
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    api.musicTracks().then(setTracks).catch(() => {});
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(settingsKey, JSON.stringify(settings));
    } catch {
      // per-viewer convenience only
    }
  }, [settings, settingsKey]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const track = tracks.find((t) => t.file === settings.musicFile) ?? null;
  const isStory = width * 16 === height * 9;

  function update<K extends keyof ReelSettings>(key: K, value: ReelSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  // Keep the audition in step with the settings it previews.
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.volume = settings.musicVolume;
  }, [settings.musicVolume]);

  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [settings.musicFile]);

  function togglePreview() {
    const a = audioRef.current;
    if (!a || !settings.musicFile) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    a.currentTime = settings.musicStartSeconds;
    a.volume = settings.musicVolume;
    a.play().then(() => setPlaying(true), (err) => onError(String(err)));
  }

  // Stop the audition where the reel would end, so what you hear is what you get.
  function onTimeUpdate() {
    const a = audioRef.current;
    if (a && a.currentTime >= settings.musicStartSeconds + settings.durationSeconds) {
      a.pause();
      setPlaying(false);
    }
  }

  async function onExport() {
    onError(null);
    setExporting(true);
    audioRef.current?.pause();
    setPlaying(false);
    try {
      const { blob, savedPath, extra } = await exportReel({ ...settings, musicFile: settings.musicFile || null });
      const url = URL.createObjectURL(blob);
      const filename = savedPath.split("/").pop() || fallbackFilename;
      setResult({ url, savedPath, filename, snapshot, extra });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="hint" style={{ marginTop: 0 }}>
        {description}
      </p>

      <div className="field">
        <label>Background music</label>
        <div className="post-image-field">
          <select value={settings.musicFile} onChange={(e) => update("musicFile", e.target.value)} style={{ flex: 1, minWidth: 0 }}>
            <option value="">No music (silent)</option>
            {tracks.map((t) => (
              <option key={t.file} value={t.file}>
                {t.file}
                {t.durationSeconds != null ? ` · ${formatTime(t.durationSeconds)}` : ""}
              </option>
            ))}
          </select>
          <button type="button" className="icon-button" style={{ width: 36, height: 36 }} title={playing ? "Stop preview" : "Preview from start point"} disabled={!settings.musicFile} onClick={togglePreview}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>
        {settings.musicFile && <audio ref={audioRef} src={`/music/${encodeURIComponent(settings.musicFile)}`} preload="auto" onTimeUpdate={onTimeUpdate} onEnded={() => setPlaying(false)} />}
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Length (seconds)</label>
          <input type="number" min={3} max={90} value={settings.durationSeconds} onChange={(e) => update("durationSeconds", Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Music starts at (seconds)</label>
          <input
            type="number"
            min={0}
            max={track?.durationSeconds ? Math.floor(track.durationSeconds) : undefined}
            value={settings.musicStartSeconds}
            disabled={!settings.musicFile}
            onChange={(e) => update("musicStartSeconds", Number(e.target.value))}
          />
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>Music volume · {Math.round(settings.musicVolume * 100)}%</label>
          <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume} disabled={!settings.musicFile} onChange={(e) => update("musicVolume", Number(e.target.value))} />
        </div>
        {!isStory && (
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Frame</label>
            <div className="segmented">
              <button type="button" className={settings.frame === "reel" ? "active" : ""} onClick={() => update("frame", "reel")}>
                9:16 reel
              </button>
              <button type="button" className={settings.frame === "original" ? "active" : ""} onClick={() => update("frame", "original")}>
                Original {width}×{height}
              </button>
            </div>
            <span className="hint">9:16 centres it on a 1080×1920 canvas filled with its background colour.</span>
          </div>
        )}
      </div>

      <div className="button-row">
        <button type="button" onClick={onExport} disabled={exporting}>
          {exporting ? "Rendering reel…" : "Export reel (MP4)"}
        </button>
        {result && (
          <a href={result.url} download={result.filename}>
            <button type="button" className="secondary">
              Download again
            </button>
          </a>
        )}
      </div>
      {result && (
        <>
          <video className="post-reel-result" src={result.url} controls />
          <p className="hint saved-path">Saved to {result.savedPath}</p>
          {renderResult?.({ url: result.url, savedPath: result.savedPath, stale: result.snapshot !== snapshot, extra: result.extra })}
        </>
      )}
    </div>
  );
}
