import { useEffect, useState } from "react";
import { Bot, ImageOff, Images, Radar, Sparkles, Trash2, X } from "lucide-react";
import { api } from "../api";
import type { AiInfo, BatchEstimate, BatchJob, PhotoStock, PlannerPost, PlannerView, PlannerRenderRun, ScoutView } from "../plannerTypes";

/**
 * The weekly batch (docs/16 §2, P4): Claude plans and writes the empty slots,
 * a separate Claude critic + code checks approve what passes, the owner looks
 * through the auto-approved posts and rejects what's wrong. Grok's scout notes
 * feed the writer. Nothing here posts anything.
 */

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function Batch({ view, onChanged, onOpen }: { view: PlannerView; onChanged: () => void; onOpen: (p: PlannerPost) => void }) {
  const [from, setFrom] = useState(addDays(view.today, 1));
  const [to, setTo] = useState(addDays(view.today, 14));
  const [scout, setScout] = useState(true);
  const [limit, setLimit] = useState("");
  const [est, setEst] = useState<BatchEstimate | null>(null);
  const [job, setJob] = useState<BatchJob | null>(null);
  const [ai, setAi] = useState<AiInfo | null>(null);
  const [notes, setNotes] = useState<ScoutView | null>(null);
  const [photos, setPhotos] = useState<PhotoStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderRun, setRenderRun] = useState<PlannerRenderRun | null>(null);

  useEffect(() => {
    api.plannerAi().then(setAi).catch(() => {});
    api.batchStatus().then(setJob).catch(() => {});
    api.scout().then(setNotes).catch(() => {});
    api.photoStock().then(setPhotos).catch(() => {});
    api.plannerRenderStatus().then(setRenderRun).catch(() => {});
  }, []);

  useEffect(() => {
    setEst(null);
    if (!from || !to || to < from) return;
    api
      .batchEstimate(from, to, scout)
      .then(setEst)
      .catch((err) => setError(errText(err)));
  }, [from, to, scout, job?.state]);

  // Poll while the batch or the scout runs.
  const busy = job?.state === "running" || !!notes?.running || (!!renderRun && !renderRun.done);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => {
      api.batchStatus().then((j) => {
        setJob(j);
        if (j && j.state !== "running") onChanged();
      });
      api.scout().then(setNotes);
      api.plannerRenderStatus().then((r) => {
        setRenderRun(r);
        if (r?.done) onChanged();
      });
    }, 2500);
    return () => clearInterval(t);
  }, [busy]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    setError(null);
    const n = limit.trim() ? Number(limit) : undefined;
    const slots = n !== undefined ? Math.min(n, est?.slots ?? n) : (est?.slots ?? 0);
    const calls = Math.ceil(slots / 6) * 2 + (scout ? 3 : 0);
    if (!confirm(`Fill ${slots} slots? This makes about ${calls} calls on your Claude${scout ? " and Grok" : ""} subscription and takes a while. Nothing is posted.`)) return;
    try {
      setJob(await api.startBatch({ from, to, scout, limit: n }));
    } catch (err) {
      setError(errText(err));
    }
  }

  async function cleanup() {
    try {
      const r = await api.batchCleanup(from, to);
      alert(`${r.removed} unwritten ideas removed.`);
      onChanged();
    } catch (err) {
      setError(errText(err));
    }
  }

  async function renderAll() {
    try {
      setRenderRun(await api.plannerRenderApproved(view.today, to));
    } catch (err) {
      setError(errText(err));
    }
  }

  async function runScout() {
    try {
      await api.startScout();
      setNotes(await api.scout());
    } catch (err) {
      setError(errText(err));
    }
  }

  async function reject(p: PlannerPost) {
    const reason = prompt("Why is this post rejected? (Claude reads this when it writes the next week)");
    if (!reason?.trim()) return;
    try {
      const r = await api.rejectPost(p.id, reason);
      if (!r.filled) alert("Rejected. The reserve had no ready post for this slot, so it's empty now.");
      onChanged();
    } catch (err) {
      setError(errText(err));
    }
  }

  const toRender = view.posts.filter((p) => p.status === "approved" && p.kind === "image" && p.date! >= view.today).length;
  const auto = view.posts.filter((p) => p.autoApproved && (p.status === "approved" || p.status === "rendered") && p.date! >= view.today);
  const needs = view.posts.filter((p) => p.status === "drafted" && p.date! >= view.today);
  const low = (photos ?? []).filter((p) => p.low);
  const calls = (t: string) => ai?.calls.find((c) => c.tool === t)?.calls ?? 0;

  return (
    <div className="planner-batch">
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <div className="card-heading-row">
          <h2>
            <Bot size={20} /> Weekly batch
          </h2>
          {ai && (
            <span className="hint">
              Claude {ai.claude.ok ? ai.claude.version : "not found"} · Grok {ai.grok.ok ? ai.grok.version : "not found"} · last 7 days: {calls("claude")} Claude, {calls("grok")}{" "}
              Grok calls
            </span>
          )}
        </div>
        <p className="hint">
          Claude fills the empty slots by the pillar mix with real book lines and a stock photo, then a second Claude call reviews each post. Posts that pass every
          check are approved on their own; the rest wait for you below. Captions get their prices and links from the code, never from Claude.
        </p>
        <div className="planner-pack-range">
          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field planner-batch-limit">
            <label>At most</label>
            <input type="number" min={1} placeholder="all" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </div>
          <label className="planner-check">
            <input type="checkbox" checked={scout} onChange={(e) => setScout(e.target.checked)} /> Grok scout first
          </label>
          <button type="button" onClick={run} disabled={busy || !est?.slots}>
            <Sparkles size={14} /> Plan &amp; draft
          </button>
          <button type="button" className="secondary" onClick={cleanup} disabled={busy} title="Removes ideas the batch created but couldn't write">
            <Trash2 size={14} /> Clean up
          </button>
          <button type="button" className="secondary" onClick={renderAll} disabled={busy || toRender === 0} title="Hook photo template, with each post's stock photo. Reels are rendered by hand.">
            <Images size={14} /> Render approved ({toRender})
          </button>
        </div>
        {est && (
          <p className="hint">
            {est.slots} empty slots · about {est.claudeCalls} Claude{est.grokCalls ? ` + ${est.grokCalls} Grok` : ""} calls ·{" "}
            {Object.entries(est.byPillar)
              .map(([k, n]) => `${k} ${n}`)
              .join(", ")}
          </p>
        )}
        {renderRun && (
          <div className={`planner-batch-job planner-batch-${renderRun.done ? "done" : "running"}`}>
            <strong>{renderRun.done ? "Rendered" : "Rendering…"}</strong>{" "}
            <span className="hint">
              {renderRun.rendered} rendered{renderRun.skipped.length ? `, ${renderRun.skipped.length} skipped (${[...new Set(renderRun.skipped.map((x) => x.reason))].join("; ")})` : ""}
            </span>
            {renderRun.log.length > 0 && <pre>{renderRun.log.slice(-6).join("\n")}</pre>}
          </div>
        )}
        {job && (
          <div className={`planner-batch-job planner-batch-${job.state}`}>
            <strong>
              {job.state === "running" ? "Running…" : job.state === "done" ? "Done" : "Failed"}: {job.from} to {job.to}
            </strong>{" "}
            <span className="hint">
              {job.created} planned · {job.drafted} written · {job.approved} approved on their own ({job.rendered ?? 0} rendered) · {job.needsYou} need you
            </span>
            <pre>{job.log.slice(-12).join("\n")}</pre>
          </div>
        )}
      </div>

      <div className="card">
        <h2>Auto-approved, from today ({auto.length})</h2>
        <p className="hint">Look these through before they go out. Rejecting one moves a ready reserve post into its slot; the reason teaches next week's drafts.</p>
        {auto.length === 0 ? (
          <p className="hint">None yet.</p>
        ) : (
          <div className="planner-thumbs">
            {auto.map((p) => (
              <div key={p.id} className="planner-thumb">
                <button type="button" className="planner-thumb-img" onClick={() => onOpen(p)} title="Open">
                  {api.mediaUrl(p.mediaPath) ? (
                    <img src={api.mediaUrl(p.mediaPath)!} alt="" loading="lazy" />
                  ) : p.photo ? (
                    <img src={api.stockImageUrl(p.photo)} alt="" loading="lazy" />
                  ) : (
                    <ImageOff size={28} />
                  )}
                  {!api.mediaUrl(p.mediaPath) && <span className="planner-thumb-hook">{p.hook}</span>}
                </button>
                <div className="planner-thumb-meta">
                  {p.date} {p.slotId} · {p.kind}
                  {p.review?.scores && (
                    <span className="hint">
                      {" "}
                      · {p.review.scores.hook}/{p.review.scores.sinhala}/{p.review.scores.accuracy}/{p.review.scores.rules}
                    </span>
                  )}
                </div>
                <button type="button" className="danger planner-thumb-reject" onClick={() => reject(p)}>
                  <X size={13} /> Reject…
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Need you ({needs.length})</h2>
        {needs.length === 0 ? (
          <p className="hint">Nothing waiting.</p>
        ) : (
          <ul className="planner-needs">
            {needs.map((p) => (
              <li key={p.id}>
                <button type="button" className="link-button" onClick={() => onOpen(p)}>
                  {p.date} {p.slotId}: {p.title || p.hook || "(untitled)"}
                </button>
                <span className="hint"> · {p.statusReason || "drafted, not reviewed yet"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <div className="card-heading-row">
          <h2>
            <Radar size={20} /> Grok scout notes
          </h2>
          <button type="button" className="secondary" onClick={runScout} disabled={!!notes?.running}>
            {notes?.running ? "Scouting…" : "Run scout now"}
          </button>
        </div>
        <p className="hint">Trends, dates and hooks from Grok's web and X search. Claude reads the newest note per topic when it writes; notes are never posts.</p>
        {notes?.running && <pre className="planner-scout-log">{notes.running.log.join("\n") || "Starting…"}</pre>}
        {notes?.notes.length ? (
          notes.notes.map((n) => (
            <details key={n.id} className="planner-scout-note">
              <summary>
                {notes.topics.find((t) => t.id === n.topic)?.label ?? n.topic} <span className="hint">· {new Date(n.at).toLocaleString()}</span>
              </summary>
              <pre>{n.text}</pre>
            </details>
          ))
        ) : (
          <p className="hint">No notes yet.</p>
        )}
      </div>

      <div className="card">
        <h2>Stock photos</h2>
        <p className="hint">
          From <code>studypal-lms/social-media/stock-images/</code>. Image posts need a photo to be approved on their own. A photo is free again 30 days after it was
          used.
        </p>
        {photos && (
          <>
            {low.length > 0 && (
              <p>
                <strong>Running low (under 6 free), download more for:</strong> {low.map((p) => `${p.folder} (${p.free}/${p.total})`).join(", ")}
              </p>
            )}
            {low.length === 0 && <p className="hint">Every folder has 6 or more free photos.</p>}
          </>
        )}
      </div>
    </div>
  );
}
