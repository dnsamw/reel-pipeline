import { useEffect, useState } from "react";
import { api } from "../api";
import { PlatformDot, PublishPanel } from "../components/PublishPanel";
import type { Manifest, ManifestEntry, Publication, PublishPlatform, RenderRun } from "../types";

/** Which languages a rendered reel was actually voiced in, from its per-phrase TTS files (older entries only have ttsEnabled). */
function ttsLabel(entry: ManifestEntry): string {
  if (!entry.ttsEnabled) return "off";
  if (!entry.ttsPhraseFiles || !entry.ttsRevealFiles) return "on";
  const en = entry.ttsPhraseFiles.some(Boolean);
  const si = entry.ttsRevealFiles.some(Boolean);
  return en && si ? "English + Sinhala" : en ? "English only" : si ? "Sinhala only" : "off";
}

export function Dashboard() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runs, setRuns] = useState<RenderRun[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [manifestRes, runsRes, publicationsRes] = await Promise.all([api.manifest(), api.listRuns(), api.publications()]);
        if (cancelled) return;
        setManifest(manifestRes);
        setRuns(runsRes);
        setPublications(publicationsRes);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    load();
    // Polling, not a websocket/SSE stream - simplest thing that works for a
    // local single-user tool where a render run is minutes long, not ms.
    const interval = setInterval(load, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const entries = manifest ? Object.entries(manifest).sort((a, b) => b[1].renderedAt.localeCompare(a[1].renderedAt)) : [];

  function publicationsFor(entry: ManifestEntry): Publication[] {
    return publications.filter((p) => p.batchId === entry.batchId && p.template === entry.template);
  }

  return (
    <div>
      <h1>Batch Monitor</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Active / recent render runs</h2>
        {runs.length === 0 ? (
          <p className="hint">No render runs started from this GUI yet - see "Batch Render".</p>
        ) : (
          runs.map((run) => <RunRow key={run.id} run={run} />)
        )}
      </div>

      <div className="card">
        <h2>Rendered batches ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="hint">output/manifest.json is empty or missing - nothing rendered yet.</p>
        ) : (
          entries.map(([key, entry]) => (
            <ManifestRow key={key} entry={entry} publications={publicationsFor(entry)} />
          ))
        )}
      </div>
    </div>
  );
}

function RunRow({ run }: { run: RenderRun }) {
  const [expanded, setExpanded] = useState(run.status === "running");
  const [live, setLive] = useState(run);

  useEffect(() => {
    setLive(run);
  }, [run]);

  useEffect(() => {
    if (live.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        setLive(await api.getRun(run.id));
      } catch {
        // Run may have been dropped server-side (restart) - stop polling silently.
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [live.status, run.id]);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setExpanded((e) => !e)}>
        <span className={`badge ${live.status}`}>{live.status}</span>
        <span style={{ fontFamily: "monospace", fontSize: 12 }}>{live.args.join(" ")}</span>
        <span className="hint" style={{ marginLeft: "auto" }}>
          started {new Date(live.startedAt).toLocaleTimeString()}
        </span>
      </div>
      {expanded && <div className="log-panel">{live.logs.length ? live.logs.join("\n") : "(no output yet)"}</div>}
    </div>
  );
}

/** The platforms a reel is live on (latest successful publish per platform), for the row header. */
function publishedPlatforms(publications: Publication[]): PublishPlatform[] {
  const out: PublishPlatform[] = [];
  for (const p of publications) if (p.status === "published" && (p.outcome ?? "live") === "live" && !out.includes(p.platform)) out.push(p.platform);
  return out;
}

function ManifestRow({ entry, publications }: { entry: ManifestEntry; publications: Publication[] }) {
  const [expanded, setExpanded] = useState(false);
  const live = publishedPlatforms(publications);
  const uploading = publications.some((p) => p.status === "uploading");

  return (
    <div className="queue-row">
      <div className="queue-row-header" onClick={() => setExpanded((e) => !e)}>
        <span className="badge done">Rendered</span>
        {live.length > 0 ? (
          <span className="badge done published-on" title={`Published on ${live.join(", ")}`}>
            Published {live.map((p) => <PlatformDot key={p} platform={p} />)}
          </span>
        ) : uploading ? (
          <span className="badge running">Publishing…</span>
        ) : (
          <span className="badge queued">Not published</span>
        )}
        <span className="queue-row-title">
          Ch {entry.chapterOrder}: {entry.chapterTitle} (template {entry.template}) - {new Date(entry.renderedAt).toLocaleString()}
        </span>
        <span className="template-picker-caret">{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div className="queue-row-body">
          <div className="manifest-row-playback">
            <video className="manifest-row-video" src={entry.mediaUrl} controls preload="none" />
            <div className="manifest-row-details">
              <p className="hint" style={{ marginTop: 0 }}>
                TTS {ttsLabel(entry)} - sidechain {entry.sidechain ? "on" : "off"} - {entry.outputPath}
              </p>
              <PublishPanel
                source={{ type: "batch", batchId: entry.batchId, template: entry.template }}
                previousCaption={publications[0]?.caption || undefined}
                fallbackCaption={entry.suggestedCaption}
                kind="reel"
                previewUrl={entry.mediaUrl}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
