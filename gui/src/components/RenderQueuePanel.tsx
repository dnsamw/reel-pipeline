import { useState } from "react";
import { api } from "../api";
import { PhraseEditFields, type PhraseEdit } from "./PhraseEditFields";
import type { Phrase, RenderRun } from "../types";

export interface RenderQueueEntry {
  batchId: string;
  chapterOrder: number;
  chapterTitle: string;
  phrases: Phrase[];
  edits: Record<string, PhraseEdit>;
  status: "pending" | "rendering" | "done" | "error";
  run: RenderRun | null;
  error: string | null;
}

async function pollUntilDone(runId: string, onUpdate: (run: RenderRun) => void): Promise<RenderRun> {
  let run = await api.getRun(runId);
  onUpdate(run);
  while (run.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    run = await api.getRun(runId);
    onUpdate(run);
  }
  return run;
}

// The right-hand column's batch-processing panel: reels are hand-picked here
// from the Queue (left column), can still be edited one last time, then
// rendered against the "Style for renders from this queue" settings - either
// all at once or one at a time. Runs sequentially (not in parallel) since
// each render shells out to ffmpeg and concurrent renders would fight over
// machine resources.
export function RenderQueuePanel({
  entries,
  onChange,
  onRemove,
  style,
  onItemRendered,
}: {
  entries: RenderQueueEntry[];
  onChange: (batchId: string, update: Partial<RenderQueueEntry>) => void;
  onRemove: (batchId: string) => void;
  style: { templateId?: string; recipeId: string; tts: "default" | "true" | "false"; sidechain: boolean };
  onItemRendered: () => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  async function renderEntry(entry: RenderQueueEntry) {
    onChange(entry.batchId, { status: "rendering", error: null });
    try {
      await Promise.all(entry.phrases.map((p) => api.updatePhrase(p.id, entry.edits[p.id])));
      const started = await api.startRender({
        phraseIds: entry.phrases.map((p) => p.id),
        templateId: style.templateId,
        recipeId: style.recipeId,
        tts: style.tts === "default" ? undefined : style.tts === "true",
        sidechain: style.sidechain || undefined,
      });
      onChange(entry.batchId, { run: started });
      const finished = await pollUntilDone(started.id, (run) => onChange(entry.batchId, { run }));
      if (finished.status === "done") {
        onChange(entry.batchId, { status: "done" });
        onItemRendered();
      } else {
        onChange(entry.batchId, { status: "error", error: "Render failed - see logs below." });
      }
    } catch (err) {
      onChange(entry.batchId, { status: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  async function renderBatch() {
    setBatchRunning(true);
    for (const entry of entries) {
      if (entry.status === "done") continue;
      await renderEntry(entry);
    }
    setBatchRunning(false);
  }

  const pendingCount = entries.filter((e) => e.status !== "done").length;

  return (
    <div className="card">
      <h2>Render Queue {entries.length ? `(${entries.length})` : ""}</h2>
      {entries.length === 0 ? (
        <p className="hint">
          Empty. Send reels here from the Queue on the left to batch-render them together against the style above.
        </p>
      ) : (
        <>
          <div className="render-queue-list">
            {entries.map((entry) => (
              <RenderQueueRow
                key={entry.batchId}
                entry={entry}
                expanded={expanded === entry.batchId}
                onToggle={() => setExpanded((cur) => (cur === entry.batchId ? null : entry.batchId))}
                onChange={(update) => onChange(entry.batchId, update)}
                onRemove={() => onRemove(entry.batchId)}
                onRenderOne={() => renderEntry(entry)}
                busy={batchRunning || entry.status === "rendering"}
              />
            ))}
          </div>
          <div className="button-row">
            <button type="button" disabled={batchRunning || pendingCount === 0} onClick={renderBatch}>
              {batchRunning ? "Rendering batch..." : `Render batch (${pendingCount})`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function RenderQueueRow({
  entry,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onRenderOne,
  busy,
}: {
  entry: RenderQueueEntry;
  expanded: boolean;
  onToggle: () => void;
  onChange: (update: Partial<RenderQueueEntry>) => void;
  onRemove: () => void;
  onRenderOne: () => void;
  busy: boolean;
}) {
  function setEdit(phraseId: string, edit: PhraseEdit) {
    onChange({ edits: { ...entry.edits, [phraseId]: edit } });
  }

  return (
    <div className="queue-row render-queue-row">
      <div className="queue-row-header" onClick={onToggle}>
        <span
          className={`badge ${entry.status === "done" ? "done" : entry.status === "error" ? "error" : entry.status === "rendering" ? "running" : "queued"}`}
        >
          {entry.status === "pending" ? "Queued" : entry.status === "rendering" ? "Rendering" : entry.status === "done" ? "Rendered" : "Error"}
        </span>
        <span className="queue-row-title">
          Ch {entry.chapterOrder}: {entry.chapterTitle} - "{entry.phrases[0]?.phrase}"
          {entry.phrases.length > 1 ? ` +${entry.phrases.length - 1} more` : ""}
        </span>
        <button
          type="button"
          className="secondary render-queue-remove"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        >
          Remove
        </button>
        <span className="template-picker-caret">{expanded ? "▴" : "▾"}</span>
      </div>

      {expanded && (
        <div className="queue-row-body">
          {entry.error && <div className="error-banner">{entry.error}</div>}

          {entry.phrases.map((p, i) => (
            <PhraseEditFields
              key={p.id}
              label={`Phrase ${i + 1} of ${entry.phrases.length}`}
              edit={entry.edits[p.id]}
              onChange={(edit) => setEdit(p.id, edit)}
            />
          ))}

          <div className="button-row">
            <button type="button" className="secondary" disabled={busy} onClick={onRenderOne}>
              {entry.status === "rendering" ? "Rendering..." : "Save & render this one"}
            </button>
          </div>

          {entry.run && (
            <div className="log-panel" style={{ marginTop: 12 }}>
              {entry.run.logs.length ? entry.run.logs.join("\n") : "Starting..."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
