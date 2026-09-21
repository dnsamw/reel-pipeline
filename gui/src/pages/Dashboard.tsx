import { useEffect, useState } from "react";
import { api } from "../api";
import type { FacebookStatus, Manifest, ManifestEntry, Publication, RenderRun } from "../types";

export function Dashboard() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runs, setRuns] = useState<RenderRun[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [fbStatus, setFbStatus] = useState<FacebookStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [manifestRes, runsRes, publicationsRes, fbRes] = await Promise.all([
          api.manifest(),
          api.listRuns(),
          api.publications(),
          api.facebookStatus(),
        ]);
        if (cancelled) return;
        setManifest(manifestRes);
        setRuns(runsRes);
        setPublications(publicationsRes);
        setFbStatus(fbRes);
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

  function latestPublicationFor(entry: ManifestEntry): Publication | null {
    return publications.find((p) => p.batchId === entry.batchId && p.template === entry.template) ?? null;
  }

  function onPublished(record: Publication) {
    setPublications((cur) => [record, ...cur.filter((p) => p.id !== record.id)]);
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
        {!fbStatus?.page && (
          <p className="hint" style={{ marginTop: 0 }}>
            No Facebook Page connected - publishing is disabled until you connect one in Settings.
          </p>
        )}
        {entries.length === 0 ? (
          <p className="hint">output/manifest.json is empty or missing - nothing rendered yet.</p>
        ) : (
          entries.map(([key, entry]) => (
            <ManifestRow
              key={key}
              entry={entry}
              publication={latestPublicationFor(entry)}
              canPublish={fbStatus?.page != null}
              onPublished={onPublished}
            />
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

function publishBadge(publication: Publication | null): { label: string; className: string } {
  if (!publication) return { label: "Not published", className: "queued" };
  if (publication.status === "published") return { label: "Published", className: "done" };
  if (publication.status === "uploading") return { label: "Publishing...", className: "running" };
  return { label: "Publish failed", className: "error" };
}

function ManifestRow({
  entry,
  publication,
  canPublish,
  onPublished,
}: {
  entry: ManifestEntry;
  publication: Publication | null;
  canPublish: boolean;
  onPublished: (record: Publication) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [caption, setCaption] = useState(publication?.caption ?? entry.suggestedCaption);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const badge = publishBadge(publication);

  async function publish() {
    setError(null);
    setPublishing(true);
    try {
      const record = await api.publish({ batchId: entry.batchId, template: entry.template, caption });
      onPublished(record);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="queue-row">
      <div className="queue-row-header" onClick={() => setExpanded((e) => !e)}>
        <span className="badge done">Rendered</span>
        <span className={`badge ${badge.className}`}>{badge.label}</span>
        <span className="queue-row-title">
          Ch {entry.chapterOrder}: {entry.chapterTitle} (template {entry.template}) - {new Date(entry.renderedAt).toLocaleString()}
        </span>
        <span className="template-picker-caret">{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div className="queue-row-body">
          {error && <div className="error-banner">{error}</div>}
          <div className="manifest-row-playback">
            <video className="manifest-row-video" src={entry.mediaUrl} controls preload="none" />
            <div className="manifest-row-details">
              <p className="hint" style={{ marginTop: 0 }}>
                TTS {entry.ttsEnabled ? "on" : "off"} - sidechain {entry.sidechain ? "on" : "off"} - {entry.outputPath}
              </p>
              <div className="field">
                <label>Facebook caption</label>
                <textarea rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
              </div>
              <div className="button-row">
                <button type="button" disabled={!canPublish || publishing} onClick={publish}>
                  {publishing ? "Publishing..." : publication?.status === "published" ? "Re-publish" : "Publish to Facebook"}
                </button>
                {publication?.status === "published" && publication.fbPermalink && (
                  <button type="button" className="secondary" onClick={() => window.open(publication.fbPermalink!, "_blank", "noreferrer")}>
                    View on Facebook
                  </button>
                )}
              </div>
              {publication?.status === "error" && publication.error && (
                <p className="hint" style={{ color: "var(--danger)" }}>
                  Last attempt failed: {publication.error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
