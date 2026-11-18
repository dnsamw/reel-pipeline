import { useEffect, useState } from "react";
import { CalendarCheck, Download, Link2, Upload } from "lucide-react";
import { api } from "../api";
import type { CsvImportResult, MatchResult, PackPlan, PlannerView } from "../plannerTypes";

/**
 * Week pack + stats (docs/16 §7, P3). The pack is what the owner loads by
 * hand into Meta Business Suite; nothing here posts to Facebook. Stats come
 * from the read-only API refresh (Insights) or the Business Suite CSV.
 */

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

export function WeekPack({ view, onChanged }: { view: PlannerView; onChanged: () => void }) {
  const [from, setFrom] = useState(addDays(view.today, 1));
  const [to, setTo] = useState(addDays(view.today, 7));
  const [plan, setPlan] = useState<PackPlan | null>(null);
  const [written, setWritten] = useState<PackPlan | null>(null);
  const [marked, setMarked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csv, setCsv] = useState<CsvImportResult | null>(null);
  const [match, setMatch] = useState<MatchResult | null>(null);

  useEffect(() => {
    setPlan(null);
    if (!from || !to || to < from) return;
    let live = true;
    api
      .weekPackPreview(from, to)
      .then((p) => live && (setPlan(p), setError(null)))
      .catch((err) => live && setError(errText(err)));
    return () => {
      live = false;
    };
  }, [from, to, written, marked]);

  async function run<T>(f: () => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError(null);
    try {
      return await f();
    } catch (err) {
      setError(errText(err));
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function exportPack() {
    const r = await run(() => api.exportWeekPack(from, to));
    if (r) {
      setWritten(r);
      setMarked(null);
    }
  }

  async function markScheduled() {
    if (!written) return;
    const r = await run(() => api.markScheduled(written.items.map((i) => i.postId)));
    if (r) {
      setMarked(r.scheduled);
      onChanged();
    }
  }

  async function importCsv(file: File) {
    const text = await file.text();
    const r = await run(() => api.importStatsCsv(text));
    if (r) {
      setCsv(r);
      setMatch(r.match);
      onChanged();
    }
  }

  async function matchNow() {
    const r = await run(() => api.matchStats());
    if (r) {
      setMatch(r);
      onChanged();
    }
  }

  const title = (postId: string) => [...view.posts, ...view.reserve].find((p) => p.id === postId)?.title;

  return (
    <div className="planner-pack">
      {error && <div className="error-banner">{error}</div>}

      <div className="card">
        <h2>Week pack</h2>
        <p className="hint">
          Rendered posts in posting order: numbered files, captions, first comments and a checklist page. Load them by hand in Meta Business Suite →
          Planner. Studio never posts to Facebook{view.facebookPosting ? " (posting is switched on in .env, but the Planner still uses the pack)" : ""}.
        </p>
        <div className="planner-editor-row planner-pack-range">
          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <button type="button" onClick={exportPack} disabled={busy || !plan?.items.length}>
            <Download size={14} /> Export {plan?.items.length ?? 0} posts
          </button>
        </div>

        {written && (
          <div className="planner-pack-done">
            <p>
              Written to <code>{written.dir}</code>. Open <code>index.html</code> in that folder: it has every caption and comment with copy buttons.
            </p>
            {marked === null ? (
              <button type="button" onClick={markScheduled} disabled={busy}>
                <CalendarCheck size={14} /> I've scheduled these {written.items.length} in Business Suite: mark scheduled
              </button>
            ) : (
              <p className="hint">{marked} posts marked scheduled.</p>
            )}
          </div>
        )}

        {plan && (
          <>
            {plan.items.length > 0 ? (
              <table className="planner-pack-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Day</th>
                    <th>Time</th>
                    <th>Post</th>
                    <th>File</th>
                    <th>First comment</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.items.map((it) => (
                    <tr key={it.postId}>
                      <td>{it.n}</td>
                      <td>{it.date}</td>
                      <td>
                        <strong>{it.time}</strong> <span className="hint">{it.slotId}</span>
                      </td>
                      <td>{it.title}</td>
                      <td className="hint">{it.file}</td>
                      <td>{it.comment ? `Variant ${it.comment.variant}` : <span className="hint">none</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="hint">No rendered posts with a caption in this range yet.</p>
            )}
            {plan.alreadyScheduled > 0 && <p className="hint">{plan.alreadyScheduled} posts in this range are already scheduled (not in the pack).</p>}
            {plan.missing.length > 0 && (
              <>
                <h3>Not ready ({plan.missing.length})</h3>
                <ul className="planner-pack-missing">
                  {plan.missing.map((m) => (
                    <li key={m.postId}>
                      {m.date} {m.slotId}: {m.title} <span className="hint">· {m.reason}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>Stats: which post went out as which</h2>
        <p className="hint">
          Insights reads the Page's posts through the API (read-only) and links them here after every refresh. If that's broken, export the posts CSV in
          Business Suite (Insights → Content → Export) and import it.
        </p>
        <div className="planner-pack-range">
          <label className="planner-file">
            <Upload size={14} /> Import Business Suite CSV…
            <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </label>
          <button type="button" className="secondary" onClick={matchNow} disabled={busy}>
            <Link2 size={14} /> Match now
          </button>
        </div>
        {csv && (
          <p>
            CSV: {csv.rows} rows, {csv.imported} new posts, {csv.known} already known{csv.skipped ? `, ${csv.skipped} skipped` : ""}.
          </p>
        )}
        {match && (
          <>
            <p>
              {match.linked.length} newly linked, {match.updated} status updates.
            </p>
            {match.linked.length > 0 && (
              <ul>
                {match.linked.map((l) => (
                  <li key={l.postId}>
                    {title(l.postId) ?? l.postId} <span className="hint">· caption match {Math.round(l.score * 100)}%</span>
                  </li>
                ))}
              </ul>
            )}
            {match.missing.length > 0 && (
              <>
                <h3>Went out, but no Facebook post found ({match.missing.length})</h3>
                <p className="hint">Check these went out in Business Suite; the caption must be the one in the Planner (±1 day).</p>
                <ul className="planner-pack-missing">
                  {match.missing.map((m) => (
                    <li key={m.postId}>
                      {m.date} {m.slotId}: {m.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
