import { useEffect, useState } from "react";
import { api } from "../api";
import type { Manifest, RenderRun } from "../types";

export function Dashboard() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [runs, setRuns] = useState<RenderRun[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [manifestRes, runsRes] = await Promise.all([api.manifest(), api.listRuns()]);
        if (cancelled) return;
        setManifest(manifestRes);
        setRuns(runsRes);
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

  return (
    <div>
      <h1>Batch Monitor</h1>
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Active / recent render runs</h2>
        {runs.length === 0 ? (
          <p className="hint">No render runs started from this GUI yet - see "Start Render".</p>
        ) : (
          runs.map((run) => <RunRow key={run.id} run={run} />)
        )}
      </div>

      <div className="card">
        <h2>Rendered batches ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="hint">output/manifest.json is empty or missing - nothing rendered yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Chapter</th>
                <th>Template</th>
                <th>TTS</th>
                <th>Sidechain</th>
                <th>Rendered</th>
                <th>Output</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([key, entry]) => (
                <tr key={key}>
                  <td>
                    {entry.chapterOrder}: {entry.chapterTitle}
                  </td>
                  <td>{entry.template}</td>
                  <td>{entry.ttsEnabled ? "on" : "off"}</td>
                  <td>{entry.sidechain ? "on" : "off"}</td>
                  <td>{new Date(entry.renderedAt).toLocaleString()}</td>
                  <td>{entry.outputPath}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
