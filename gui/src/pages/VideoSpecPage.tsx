import { useEffect, useState } from "react";
import { api } from "../api";
import type { VideoSpec } from "../types";

const LABELS: Record<keyof VideoSpec, string> = {
  status: "Status",
  container: "Container",
  videoCodec: "Video codec",
  resolution: "Resolution",
  frameRate: "Frame rate",
  audio: "Audio",
  duration: "Duration",
  namingConvention: "Naming / folder convention",
};

export function VideoSpecPage() {
  const [spec, setSpec] = useState<VideoSpec | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.videoSpec().then(setSpec).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div>
      <h1>Intro/Outro Video Clip Spec</h1>
      {error && <div className="error-banner">{error}</div>}
      <div className="card">
        <p className="hint" style={{ marginTop: 0 }}>
          Manually produce intro/outro clips to this standard so they drop in cleanly once video-clip playback is wired up.
          This page exists so the requirements live somewhere other than a Slack thread.
        </p>
        {spec ? (
          <dl className="spec-list">
            {(Object.keys(LABELS) as (keyof VideoSpec)[]).map((key) => (
              <div key={key}>
                <dt>{LABELS[key]}</dt>
                <dd>{spec[key]}</dd>
              </div>
            ))}
          </dl>
        ) : (
          !error && <p className="hint">Loading...</p>
        )}
      </div>
    </div>
  );
}
