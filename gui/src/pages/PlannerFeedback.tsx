import { useEffect, useState } from "react";
import { TrendingUp } from "lucide-react";
import { api } from "../api";
import type { FeedbackGroup, FeedbackReport, FeedbackSample } from "../plannerTypes";

/**
 * P5 "What worked" (studypal-lms docs/16 §2 step 1): the Page's Facebook
 * numbers by slot, time of day, pillar, hook style and book, and what the next
 * batch does with them. Read-only: slots are never moved by code.
 */

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

function GroupTable({ title, groups, unit, min, empty }: { title: string; groups: FeedbackGroup[]; unit: (g: FeedbackGroup) => string; min: number; empty: string }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <table className="insights-table planner-feedback-table">
          <thead>
            <tr>
              <th></th>
              <th>Posts</th>
              <th>Score</th>
              <th>Median</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key} className={g.signal ? "" : "planner-feedback-weak"} title={g.signal ? "" : `Fewer than ${min} posts: not counted yet`}>
                <td>{g.label}</td>
                <td>{g.n}</td>
                <td>
                  <span className="planner-feedback-bar">
                    <span style={{ width: `${g.score}%` }} className={g.score >= 60 ? "good" : g.score <= 40 ? "bad" : ""} />
                  </span>
                  {g.score}
                </td>
                <td>
                  {fmt(g.value)} {unit(g)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SampleList({ title, items, unitOf }: { title: string; items: FeedbackSample[]; unitOf: (s: FeedbackSample) => string }) {
  if (items.length === 0) return null;
  return (
    <div className="card">
      <h2>{title}</h2>
      <ol className="planner-feedback-list">
        {items.map((s) => (
          <li key={s.remoteId}>
            <strong>{s.score}</strong> · {s.kind} · {s.day} · {fmt(s.value)} {unitOf(s)}
            {s.planner && <span className="planner-tag">Planner</span>}
            <div>{s.permalink ? <a href={s.permalink} target="_blank" rel="noreferrer">{s.hook || "(no text)"}</a> : s.hook || "(no text)"}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Feedback() {
  const [days, setDays] = useState(56);
  const [r, setR] = useState<FeedbackReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setR(null);
    api
      .plannerFeedback(days)
      .then(setR)
      .catch((e) => setError(errText(e)));
  }, [days]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!r) return <p className="hint">Reading the numbers…</p>;

  const unitFor = (kind: string | undefined) => {
    const by = kind === "image" ? r.scoreBy.image : kind === "reel" ? r.scoreBy.reel : null;
    return by === "engagement" ? "likes+comments+shares" : (by ?? "");
  };
  const unit = (g: FeedbackGroup) => unitFor(g.kind);
  const moved = r.weights.filter((w) => w.weight !== 1);
  const reels = r.byBand.filter((g) => g.kind === "reel");
  const images = r.byBand.filter((g) => g.kind === "image");

  return (
    <div className="planner-feedback">
      <div className="card">
        <div className="card-heading-row">
          <h2>
            <TrendingUp size={20} /> What worked
          </h2>
          <div className="segmented">
            {[28, 56, 90, 180].map((d) => (
              <button key={d} type="button" className={days === d ? "active" : ""} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
        </div>
        <p className="hint">
          Facebook posts from {r.from} to {r.to} ({r.samples} posts, {r.plannerSamples} from the Planner; the last {r.settleDays} days are left out while their numbers
          still climb). Each post gets a <strong>score 0-100</strong>: its rank among posts of the same type (reels by {r.scoreBy.reel ?? "-"}, image posts by{" "}
          {unitFor("image") || "-"}). <strong>50 is a typical post.</strong> A group counts once it has {r.minPosts} posts; greyed rows don't count yet. Refresh Insights or
          import the Business Suite CSV (Week pack &amp; stats) for newer numbers.
        </p>
      </div>

      <div className="card">
        <h2>What the next batch does with this</h2>
        <ul className="planner-feedback-list">
          <li>
            <strong>Pillar mix:</strong>{" "}
            {moved.length
              ? moved.map((w) => `${w.name} ${w.sharePct}% → ${w.effectivePct}% (score from ${w.n} posts)`).join("; ")
              : `your shares are used as set (a pillar moves, by at most ±25 %, once it has ${r.minPosts} measured Planner posts).`}
          </li>
          <li>
            <strong>Claude's writing:</strong> {r.notes ? "gets the hook styles, best and weakest hooks below as hints (rules still win)." : "nothing yet: too few posts with numbers."}
          </li>
          <li>
            <strong>Reserve:</strong> {r.reserve.now} of {r.reserve.target}. The batch tops it up with timeless posts; Planner posts that score 75+ are copied back in once
            their lines are out of the 90-day window. Empty slots take a reserve post at the end of a batch and before a week pack is written.
          </li>
        </ul>
        {r.suggestions.length > 0 && (
          <>
            <h3>Slot times to consider (you decide, in the Slots tab)</h3>
            <ul className="planner-feedback-list">
              {r.suggestions.map((s) => (
                <li key={s.slotId}>{s.text}</li>
              ))}
            </ul>
            <p className="hint">Time of day isn't the only difference between these posts (topic and date differ too), so try a new time for a few weeks and compare.</p>
          </>
        )}
      </div>

      <div className="planner-feedback-grid">
        <GroupTable title="By slot" groups={r.bySlot} unit={unit} min={r.minPosts} empty="No posts in a slot window yet." />
        <GroupTable title="By hook style" groups={r.byStyle} unit={() => ""} min={r.minPosts} empty="No hooks yet." />
        <GroupTable title="Reels by time of day" groups={reels} unit={() => unitFor("reel")} min={r.minPosts} empty="No reels with numbers." />
        <GroupTable title="Image posts by time of day" groups={images} unit={() => unitFor("image")} min={r.minPosts} empty="No image posts with numbers." />
        <GroupTable title="By pillar (Planner posts)" groups={r.byPillar} unit={() => ""} min={r.minPosts} empty="No measured Planner posts yet: they show here once they're matched to Facebook." />
        <GroupTable title="By book (Planner posts)" groups={r.byBook} unit={() => ""} min={r.minPosts} empty="No measured Planner posts yet." />
      </div>

      <div className="planner-feedback-grid">
        <SampleList title="Best posts" items={r.top} unitOf={(s) => unitFor(s.kind)} />
        <SampleList title="Weakest posts" items={r.bottom} unitOf={(s) => unitFor(s.kind)} />
      </div>
    </div>
  );
}
