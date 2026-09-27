import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, BrainCircuit, ExternalLink, FlaskConical, Lightbulb, RefreshCw, Send, Sparkles, TrendingUp } from "lucide-react";
import { api } from "../api";
import { PlatformDot } from "../components/PublishPanel";
import type {
  AiReport,
  AiReportRecord,
  AiStatus,
  Comparison,
  ContentPiece,
  InsightsOverview,
  PlatformResult,
  PublishPlatform,
  StatsAccess,
  TikTokVideoOption,
} from "../types";

const PLATFORM_LABELS: Record<PublishPlatform, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

function compact(n: number | null | undefined): string {
  if (n == null) return "-";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

function ago(iso: string | null): string {
  if (!iso) return "never";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "youtube" -> "YouTube"; anything else (e.g. "all") just capitalised. */
const platformName = (s: string) => PLATFORM_LABELS[s.toLowerCase() as PublishPlatform] ?? cap(s);

/** "quiz-challenge-2" -> "Challenge opener 3" (the built-in caption bank's line). */
function hookLabel(v: string): string {
  const m = v.match(/^\w+-(\w+)-(\d+)$/);
  return m ? `${cap(m[1])} opener ${Number(m[2]) + 1}` : v;
}

function groupLabel(c: Comparison, value: string): string {
  if (c.dimension === "hookId") return hookLabel(value);
  if (c.dimension === "tone" || c.dimension === "timeOfDay") return cap(value);
  return value;
}

function Confidence({ level }: { level: "low" | "medium" | "high" }) {
  return <span className={`badge confidence ${level}`}>{cap(level)} confidence</span>;
}

/**
 * Insights: Kimi's analysis, predictions and content plan (when an AI key is
 * set), on top of a built-in analysis that always works - post scores against
 * your own history, what's working, suggestions and chapter coverage.
 */
export function Insights() {
  const [data, setData] = useState<InsightsOverview | null>(null);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.insights().then(setData).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    api.aiStatus().then(setAi).catch(() => setAi({ available: false, model: null }));
  }, []);

  async function refresh() {
    setRefreshing(true);
    setError(null);
    try {
      setData(await api.refreshInsights());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="insights-page">
      <div className="insights-header">
        <div>
          <h1>Insights</h1>
          <p className="insights-sub">How your posts are doing everywhere, and what to post next.</p>
        </div>
        <div className="insights-refresh">
          <span className="hint">Stats updated {ago(data?.refreshedAt ?? null)}</span>
          <button type="button" className="secondary small" onClick={refresh} disabled={refreshing || data?.refreshing}>
            <RefreshCw size={13} className={refreshing ? "spin" : undefined} /> {refreshing ? "Refreshing…" : "Refresh stats"}
          </button>
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      {data && <AccessStrip access={data.access} />}

      <KimiPanel ai={ai} overview={data} />

      {data && <BuiltinPanel data={data} onLinked={refresh} />}
      {!data && !error && <p className="hint">Loading…</p>}
    </div>
  );
}

// --- What each platform lets us measure ---

function AccessStrip({ access }: { access: StatsAccess[] }) {
  const label = (a: StatsAccess) => (!a.connected ? "Not connected" : a.level === "full" ? "Full stats" : a.level === "partial" ? "Some stats" : "Not measured");
  return (
    <div className="access-strip">
      {access.map((a) => (
        <div key={a.platform} className={`access-card ${a.connected ? a.level : "off"}`}>
          <div className="access-card-head">
            <PlatformDot platform={a.platform} />
            <strong>{PLATFORM_LABELS[a.platform]}</strong>
            <span className="access-level">{label(a)}</span>
          </div>
          {a.fix && (
            <details className="access-fix">
              <summary>{a.connected ? "What's missing" : "How to connect"}</summary>
              <p>{a.fix}</p>
              {a.platform === "tiktok" && a.connected && a.level === "none" && (
                <a className="button-link" href={api.tiktokStatsConnectUrl()}>
                  Reconnect TikTok with stats
                </a>
              )}
              {!a.connected && <Link to="/settings">Open Settings</Link>}
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Kimi ---

function KimiPanel({ ai, overview }: { ai: AiStatus | null; overview: InsightsOverview | null }) {
  const [reports, setReports] = useState<AiReportRecord[]>([]);
  const [shownId, setShownId] = useState<string | null>(null);
  const [focus, setFocus] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.aiReports().then((r) => {
      setReports(r);
      setShownId(r.find((x) => x.status !== "error")?.id ?? r[0]?.id ?? null);
    }).catch(() => {});
  }, []);

  const running = reports.find((r) => r.status === "running") ?? null;

  // Poll the running report until it finishes.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const r = await api.aiReport(running.id).catch(() => null);
      if (r && r.status !== "running") {
        setReports((cur) => cur.map((x) => (x.id === r.id ? r : x)));
        setShownId(r.id);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [running]);

  async function start() {
    setError(null);
    try {
      const r = await api.startAiReport(focus);
      setReports((cur) => [r, ...cur]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const shown = reports.find((r) => r.id === shownId && r.status !== "running") ?? null;
  const count = overview?.contents.length ?? 0;

  return (
    <div className="card kimi-card">
      <div className="card-heading-row">
        <h2>
          <BrainCircuit size={20} /> Kimi analysis
        </h2>
        {ai?.model && <span className="hint">{ai.model}</span>}
      </div>

      {ai && !ai.available ? (
        <p className="kimi-off">
          Add <code>NVIDIA_API_KEY</code> to <code>.env</code> and restart the server to get Kimi's analysis, predictions and content plan. The
          built-in analysis below works without it.
        </p>
      ) : (
        <>
          <div className="kimi-start">
            <div className="field">
              <label htmlFor="kimi-focus">Focus (optional)</label>
              <input
                id="kimi-focus"
                type="text"
                placeholder="e.g. why is TikTok behind? or plan next week's posts"
                value={focus}
                onChange={(e) => setFocus(e.target.value)}
                disabled={!!running}
                onKeyDown={(e) => e.key === "Enter" && !running && start()}
              />
            </div>
            <button type="button" onClick={start} disabled={!!running || !ai}>
              <Sparkles size={14} /> {running ? "Analysing…" : "Analyse with Kimi"}
            </button>
          </div>
          {running && (
            <p className="kimi-running">
              <RefreshCw size={13} className="spin" /> Kimi is reading your {count} post{count === 1 ? "" : "s"} and your unposted phrases. With a full history this
              takes 3-8 minutes. You can leave this page; the report is saved.
            </p>
          )}
          {error && <div className="error-banner">{error}</div>}
        </>
      )}

      {reports.filter((r) => r.status !== "running").length > 1 && (
        <div className="field kimi-history">
          <label htmlFor="kimi-report">Report</label>
          <select id="kimi-report" value={shown?.id ?? ""} onChange={(e) => setShownId(e.target.value)}>
            {reports
              .filter((r) => r.status !== "running")
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.createdAt).toLocaleString()} {r.focus ? `- ${r.focus.slice(0, 40)}` : ""} {r.status === "error" ? "(failed)" : ""}
                </option>
              ))}
          </select>
        </div>
      )}

      {shown?.status === "error" && <div className="error-banner">This report failed: {shown.error}</div>}
      {shown?.report && <ReportView record={shown} report={shown.report} />}
      {!shown && !running && ai?.available && <p className="hint kimi-empty">No reports yet. Press Analyse with Kimi.</p>}

      {ai?.available && <AskKimi />}
    </div>
  );
}

function ReportView({ record, report }: { record: AiReportRecord; report: AiReport }) {
  return (
    <div className="report">
      <div className="report-meta">
        <Confidence level={report.confidence} />
        <span className="hint">
          {new Date(record.createdAt).toLocaleString()} · based on {record.contentCount} post{record.contentCount === 1 ? "" : "s"} ({record.measuredCount} measured)
          {record.focus ? ` · focus: ${record.focus}` : ""}
        </span>
      </div>
      <p className="report-summary">{report.summary}</p>

      {report.nextContent.length > 0 && (
        <section className="report-section">
          <h3>
            <Lightbulb size={16} /> Post next
          </h3>
          <div className="idea-grid">
            {report.nextContent.map((idea, i) => (
              <div key={i} className="idea-card">
                <div className="idea-head">
                  <strong>{idea.title}</strong>
                  {idea.expected && <span className={`badge expected ${idea.expected}`}>{idea.expected === "above" ? "Expected above average" : idea.expected === "below" ? "Expected below average" : "Expected average"}</span>}
                </div>
                <p className="idea-facts">
                  {[idea.format, idea.tone && `${cap(idea.tone)} tone`, idea.postTime].filter(Boolean).join(" · ")}
                  {idea.platforms.length > 0 && <> · {idea.platforms.map(platformName).join(", ")}</>}
                </p>
                {idea.hook && <p className="idea-hook">"{idea.hook}"</p>}
                {idea.phrases.length > 0 && (
                  <ul className="idea-phrases">
                    {idea.phrases.map((p) => (
                      <li key={p.id}>
                        {p.english}
                        {p.sinhala && <span lang="si"> - {p.sinhala}</span>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="idea-why">{idea.why}</p>
              </div>
            ))}
          </div>
          <p className="hint idea-note">Render these from Queue Render: pick the chapter and add the listed phrases.</p>
        </section>
      )}

      {report.insights.length > 0 && (
        <section className="report-section">
          <h3>
            <TrendingUp size={16} /> What the data says
          </h3>
          <ul className="insight-list">
            {report.insights.map((ins, i) => (
              <li key={i}>
                <div className="insight-head">
                  <strong>{ins.title}</strong> <Confidence level={ins.confidence} />
                </div>
                <p>{ins.detail}</p>
                {ins.evidence && <p className="hint">Evidence: {ins.evidence}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.predictions.length > 0 && (
        <section className="report-section">
          <h3>Predictions</h3>
          <table className="insights-table predictions-table">
            <thead>
              <tr>
                <th>If you post…</th>
                <th>Where</th>
                <th>Expect</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {report.predictions.map((p, i) => (
                <tr key={i}>
                  <td>{p.idea}</td>
                  <td>{p.platform ? platformName(p.platform) : "-"}</td>
                  <td>
                    <span className={`badge expected ${p.expected}`}>{cap(p.expected)}</span>
                  </td>
                  <td className="hint-cell">{p.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {report.experiments.length > 0 && (
        <section className="report-section">
          <h3>
            <FlaskConical size={16} /> Experiments to run
          </h3>
          <ul className="insight-list">
            {report.experiments.map((e, i) => (
              <li key={i}>
                <strong>{e.hypothesis}</strong>
                <p>{e.how}</p>
                <p className="hint">Decided by: {e.measure}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.warnings.length > 0 && (
        <section className="report-section report-warnings">
          <h3>
            <AlertTriangle size={16} /> Keep in mind
          </h3>
          <ul>
            {report.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AskKimi() {
  const [q, setQ] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { answer: a } = await api.askAi(q);
      setAnswer({ q, a });
      setQ("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask-kimi">
      <h3>Ask about your stats</h3>
      <div className="kimi-start">
        <div className="field">
          <label htmlFor="kimi-question">Your question</label>
          <input
            id="kimi-question"
            type="text"
            placeholder="e.g. Which chapter should I post from next, and why?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !busy && ask()}
            disabled={busy}
          />
        </div>
        <button type="button" className="secondary" onClick={ask} disabled={busy || !q.trim()}>
          <Send size={14} /> {busy ? "Thinking… (up to a minute or two)" : "Ask"}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {answer && (
        <div className="ask-answer">
          <p className="hint">{answer.q}</p>
          <div className="ask-answer-text">{answer.a}</div>
        </div>
      )}
    </div>
  );
}

// --- Built-in analysis ---

function BuiltinPanel({ data, onLinked }: { data: InsightsOverview; onLinked: () => void }) {
  const tiktokOn = data.access.some((a) => a.platform === "tiktok" && a.level !== "none");
  const [videos, setVideos] = useState<TikTokVideoOption[]>([]);
  useEffect(() => {
    if (tiktokOn) api.tiktokVideos().then(setVideos).catch(() => {});
  }, [tiktokOn, data.refreshedAt]);

  return (
    <div className="card">
      <div className="card-heading-row">
        <h2>Built-in analysis</h2>
        <span className="hint">No AI needed · {data.measuredCount} measured post{data.measuredCount === 1 ? "" : "s"}</span>
      </div>

      {data.suggestions.length > 0 && (
        <section className="report-section">
          <h3>Suggestions</h3>
          <ul className="suggestion-list">
            {data.suggestions.map((s, i) => (
              <li key={i} className={`suggestion ${s.kind}`}>
                <span>{s.text}</span>
                {s.kind !== "fix" && s.kind !== "data" && s.kind !== "coverage" && <Confidence level={s.confidence} />}
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.predictions.length > 0 && (
        <section className="report-section">
          <h3>Likely best next posts</h3>
          <p className="hint">From your past averages, shrunk towards the overall average when a combination has few posts.</p>
          <table className="insights-table">
            <thead>
              <tr>
                <th>Format</th>
                <th>Tone</th>
                <th>Time</th>
                <th>Expected score</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {data.predictions.map((p, i) => (
                <tr key={i}>
                  <td>{p.format}</td>
                  <td>{cap(p.tone)}</td>
                  <td>{cap(p.timeOfDay)}</td>
                  <td>{p.expectedScore}</td>
                  <td className="hint-cell">
                    {p.basedOn} post{p.basedOn === 1 ? "" : "s"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {data.comparisons.length > 0 ? (
        <section className="report-section">
          <h3>What's working</h3>
          <p className="hint">Average score (0-100, against your own posts on the same platform) for each value.</p>
          <div className="comparison-grid">
            {data.comparisons.map((c) => (
              <ComparisonBars key={c.dimension} comparison={c} />
            ))}
          </div>
        </section>
      ) : (
        <section className="report-section">
          <h3>What's working</h3>
          <p className="hint">Comparisons appear once at least two measured posts differ in something (tone, format, time…).</p>
        </section>
      )}

      {data.coverage.length > 0 && <Coverage data={data} />}

      <section className="report-section">
        <h3>Posts</h3>
        {data.contents.length === 0 ? (
          <p className="hint">Nothing published yet. Publish from Monitor or Post Creator.</p>
        ) : (
          <PostsTable contents={data.contents} videos={videos} onLinked={onLinked} />
        )}
      </section>
    </div>
  );
}

function ComparisonBars({ comparison }: { comparison: Comparison }) {
  return (
    <div className="comparison">
      <h4>{comparison.label}</h4>
      <ul className="bar-list">
        {comparison.groups.map((g) => {
          const v = g.avgScore ?? 0;
          const tip = `${groupLabel(comparison, g.value)}: score ${Math.round(v)} from ${g.n} post${g.n === 1 ? "" : "s"}${g.avgWatchPct != null ? `, ${Math.round(g.avgWatchPct)}% watched` : ""}${g.avgEngagement != null ? `, ${g.avgEngagement.toFixed(1)}% engagement` : ""}`;
          return (
            <li key={g.value} title={tip}>
              <span className="bar-label">{groupLabel(comparison, g.value)}</span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.max(2, v)}%` }} />
              </span>
              <span className="bar-value">
                {Math.round(v)} <span className="hint">n={g.n}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Coverage({ data }: { data: InsightsOverview }) {
  const total = data.coverage.reduce((a, c) => a + c.totalPhrases, 0);
  const posted = data.coverage.reduce((a, c) => a + c.postedPhrases, 0);
  return (
    <section className="report-section">
      <h3>Phrase coverage</h3>
      <p className="hint">
        {posted} of {total} phrases posted in a reel so far.
      </p>
      <ul className="bar-list coverage-list">
        {data.coverage.map((c) => {
          const pct = c.totalPhrases ? (c.postedPhrases / c.totalPhrases) * 100 : 0;
          return (
            <li key={`${c.chapterOrder}-${c.chapter}`} title={`${c.postedPhrases} of ${c.totalPhrases} phrases posted`}>
              <span className="bar-label" lang="si">
                {c.chapterOrder}. {c.chapter}
              </span>
              <span className="bar-track">
                <span className="bar-fill" style={{ width: `${Math.max(pct > 0 ? 2 : 0, pct)}%` }} />
              </span>
              <span className="bar-value">
                {c.postedPhrases}/{c.totalPhrases}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const KIND_LABELS: Record<string, string> = { reel: "Reel", video: "Video", photo: "Photo post", carousel: "Carousel", text: "Text post" };
const PAGE_SIZE = 25;

function PostsTable({ contents, videos, onLinked }: { contents: ContentPiece[]; videos: TikTokVideoOption[]; onLinked: () => void }) {
  const [sort, setSort] = useState<"newest" | "top">("newest");
  const [shown, setShown] = useState(PAGE_SIZE);
  const sorted = useMemo(
    () => (sort === "newest" ? contents : [...contents].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.totalViews ?? 0) - (a.totalViews ?? 0))),
    [contents, sort],
  );
  return (
    <div className="insights-table-wrap">
      <div className="segmented posts-sort">
        <button type="button" className={sort === "newest" ? "active" : ""} onClick={() => setSort("newest")}>
          Newest
        </button>
        <button type="button" className={sort === "top" ? "active" : ""} onClick={() => setSort("top")}>
          Top score
        </button>
      </div>
      <table className="insights-table posts-table">
        <thead>
          <tr>
            <th>Posted</th>
            <th>Content</th>
            <th>Platforms</th>
            <th title="Average of the platform scores: 0-100 against your own posts on the same platform">Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, shown).map((c) => (
            <tr key={c.key}>
              <td className="nowrap">
                {new Date(c.firstPostedAt).toLocaleDateString()}
                <div className="hint">
                  {c.weekday.slice(0, 3)} {c.timeOfDay}
                </div>
              </td>
              <td>
                <strong>{c.format ?? KIND_LABELS[c.kind] ?? c.kind}</strong>
                {c.source === "external" && <span className="badge posted-directly">Posted directly</span>}
                {c.title && <div className="post-title">{c.title}</div>}
                {c.caption && <div className="post-caption">{c.caption}</div>}
                {c.chapter && (
                  <div className="hint" lang="si">
                    {c.chapter}
                  </div>
                )}
                {c.phrases.length > 0 && <div className="post-phrases">{c.phrases.join(" · ")}</div>}
                <div className="hint">
                  {[c.durationSeconds != null && `${Math.round(c.durationSeconds)}s`, c.tone && `${cap(c.tone)} tone`, c.hookId && hookLabel(c.hookId)].filter(Boolean).join(" · ")}
                </div>
              </td>
              <td>
                <div className="platform-results">
                  {c.platforms.map((p) => (
                    <PlatformCell key={p.postKey} result={p} videos={videos} onLinked={onLinked} />
                  ))}
                </div>
              </td>
              <td className="score-cell">{c.score ?? <span className="hint">-</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > shown && (
        <button type="button" className="secondary small posts-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
          Show more ({sorted.length - shown} left)
        </button>
      )}
    </div>
  );
}

function PlatformCell({ result: p, videos, onLinked }: { result: PlatformResult; videos: TikTokVideoOption[]; onLinked: () => void }) {
  const [linking, setLinking] = useState(false);
  const m = p.metrics;
  // Only app publishes can be linked (to the TikTok video their draft became).
  const canLink = p.platform === "tiktok" && p.publicationId != null && videos.length > 0;

  async function link(videoId: string) {
    setLinking(true);
    try {
      await api.linkTikTok(p.publicationId!, videoId || null);
      onLinked();
    } finally {
      setLinking(false);
    }
  }

  const stats = useMemo(() => {
    if (!m) return null;
    return [
      m.views != null && `${compact(m.views)} views`,
      m.likes != null && `${compact(m.likes)} likes`,
      m.comments != null && `${compact(m.comments)} comments`,
      m.shares != null && `${compact(m.shares)} shares`,
      m.saves != null && `${compact(m.saves)} saves`,
      m.avgWatchPct != null && `${Math.round(m.avgWatchPct)}% watched`,
    ].filter(Boolean) as string[];
  }, [m]);

  return (
    <div className="platform-result">
      <PlatformDot platform={p.platform} />
      <span className="platform-result-body">
        <span className="platform-result-name">
          {PLATFORM_LABELS[p.platform]}
          {p.outcome && p.outcome !== "live" && <span className="hint"> ({p.outcome})</span>}
          {p.score != null && <span className="platform-score"> {p.score}</span>}
          {p.permalink && (
            <a href={p.permalink} target="_blank" rel="noreferrer" aria-label="Open post">
              <ExternalLink size={11} />
            </a>
          )}
        </span>
        {stats && stats.length > 0 && <span className="platform-result-stats">{stats.join(" · ")}</span>}
        {p.note && <span className="hint platform-result-note">{p.note}</span>}
        {canLink && (
          <div className="field tiktok-link">
            <select aria-label="TikTok post this draft became" defaultValue="" disabled={linking} onChange={(e) => link(e.target.value)}>
              <option value="">{m ? "Change linked TikTok post…" : "Link the TikTok post…"}</option>
              {videos.map((v) => (
                <option key={v.id} value={v.id}>
                  {new Date(v.createTime).toLocaleDateString()} - {(v.description || "(no caption)").slice(0, 40)}
                </option>
              ))}
            </select>
          </div>
        )}
      </span>
    </div>
  );
}
