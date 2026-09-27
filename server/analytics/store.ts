import { randomUUID } from "node:crypto";
import { db } from "../db";
import type { AccountPost, AiReport, AiReportRecord, PostMetrics, StatsAccess } from "../../src/analytics/types";

// Insights data (see server/analytics/index.ts). Snapshots are kept, not
// overwritten, so growth over time (views at day 1 vs day 7) can be read later.
db.exec(`
  CREATE TABLE IF NOT EXISTS metric_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    publication_id TEXT NOT NULL,
    platform TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    metrics_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS metric_snapshots_pub ON metric_snapshots (publication_id, fetched_at);

  -- Singleton: when stats were last refreshed and what each platform allowed.
  CREATE TABLE IF NOT EXISTS analytics_state (
    id TEXT PRIMARY KEY,
    refreshed_at TEXT,
    access_json TEXT NOT NULL DEFAULT '[]',
    notes_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS ai_reports (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL,
    model TEXT,
    focus TEXT,
    report_json TEXT,
    error TEXT,
    content_count INTEGER NOT NULL DEFAULT 0,
    measured_count INTEGER NOT NULL DEFAULT 0
  );
`);

// Every post found on a connected account (app-published or not). Metrics live in
// metric_snapshots, keyed "<platform>:<remote_id>" (publication_id column).
db.exec(`
  CREATE TABLE IF NOT EXISTS platform_posts (
    platform TEXT NOT NULL,
    remote_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    kind TEXT NOT NULL,
    caption TEXT,
    title TEXT,
    duration_seconds REAL,
    permalink TEXT,
    note TEXT,
    seen_at TEXT NOT NULL,
    PRIMARY KEY (platform, remote_id)
  );
`);

// TikTok uploads are drafts: the video the creator finally posts has its own
// id, matched after the fact (automatically or by hand) and stored here.
const cols = db.prepare("PRAGMA table_info(publications)").all() as { name: string }[];
if (!cols.some((c) => c.name === "stats_remote_id")) db.exec("ALTER TABLE publications ADD COLUMN stats_remote_id TEXT");

// A server restart kills a running report job.
db.prepare("UPDATE ai_reports SET status = 'error', error = 'Interrupted by a server restart' WHERE status = 'running'").run();

export const postKey = (p: Pick<AccountPost, "platform" | "remoteId">) => `${p.platform}:${p.remoteId}`;

/**
 * Stores a platform's posts from one refresh, with a metrics snapshot each.
 * `complete` = the listing succeeded, so posts no longer in it were deleted on the platform and are dropped here too.
 */
export function savePlatformPosts(platform: string, posts: AccountPost[], complete: boolean, fetchedAt: string): void {
  const upsert = db.prepare(
    `INSERT INTO platform_posts (platform, remote_id, created_at, kind, caption, title, duration_seconds, permalink, note, seen_at)
     VALUES (@platform, @remoteId, @createdAt, @kind, @caption, @title, @durationSeconds, @permalink, @note, @seenAt)
     ON CONFLICT(platform, remote_id) DO UPDATE SET created_at = @createdAt, kind = @kind, caption = @caption, title = @title,
       duration_seconds = @durationSeconds, permalink = @permalink, note = @note, seen_at = @seenAt`,
  );
  db.transaction(() => {
    for (const p of posts) {
      upsert.run({ ...p, seenAt: fetchedAt });
      saveSnapshot(postKey(p), platform, p.metrics, fetchedAt);
    }
    if (complete) db.prepare("DELETE FROM platform_posts WHERE platform = ? AND seen_at <> ?").run(platform, fetchedAt);
  })();
}

/** Every stored post with its latest metrics. */
export function listPlatformPosts(): (AccountPost & { fetchedAt: string | null })[] {
  const rows = db.prepare("SELECT * FROM platform_posts").all() as {
    platform: string;
    remote_id: string;
    created_at: string;
    kind: string;
    caption: string | null;
    title: string | null;
    duration_seconds: number | null;
    permalink: string | null;
    note: string | null;
  }[];
  const snaps = latestSnapshots();
  return rows.map((r) => {
    const key = `${r.platform}:${r.remote_id}`;
    const snap = snaps.get(key);
    return {
      platform: r.platform as AccountPost["platform"],
      remoteId: r.remote_id,
      createdAt: r.created_at,
      kind: r.kind as AccountPost["kind"],
      caption: r.caption,
      title: r.title,
      durationSeconds: r.duration_seconds,
      permalink: r.permalink,
      note: r.note,
      metrics: snap?.metrics ?? { views: null, reach: null, likes: null, comments: null, shares: null, saves: null, avgWatchSeconds: null, avgWatchPct: null, followsGained: null },
      fetchedAt: snap?.fetchedAt ?? null,
    };
  });
}

export function saveSnapshot(publicationId: string, platform: string, metrics: PostMetrics, fetchedAt: string): void {
  db.prepare("INSERT INTO metric_snapshots (publication_id, platform, fetched_at, metrics_json) VALUES (?, ?, ?, ?)").run(
    publicationId,
    platform,
    fetchedAt,
    JSON.stringify(metrics),
  );
}

/** Latest snapshot per publication. */
export function latestSnapshots(): Map<string, { metrics: PostMetrics; fetchedAt: string }> {
  const rows = db
    .prepare(
      `SELECT s.publication_id, s.fetched_at, s.metrics_json FROM metric_snapshots s
       JOIN (SELECT publication_id, MAX(id) AS id FROM metric_snapshots GROUP BY publication_id) m ON m.id = s.id`,
    )
    .all() as { publication_id: string; fetched_at: string; metrics_json: string }[];
  return new Map(rows.map((r) => [r.publication_id, { metrics: JSON.parse(r.metrics_json) as PostMetrics, fetchedAt: r.fetched_at }]));
}

export interface AnalyticsState {
  refreshedAt: string | null;
  access: StatsAccess[];
  /** publication id -> why it isn't (fully) measured. */
  notes: Record<string, string>;
}

export function getState(): AnalyticsState {
  const row = db.prepare("SELECT * FROM analytics_state WHERE id = 'global'").get() as
    | { refreshed_at: string | null; access_json: string; notes_json: string }
    | undefined;
  return row ? { refreshedAt: row.refreshed_at, access: JSON.parse(row.access_json), notes: JSON.parse(row.notes_json) } : { refreshedAt: null, access: [], notes: {} };
}

export function saveState(state: AnalyticsState): void {
  db.prepare(
    `INSERT INTO analytics_state (id, refreshed_at, access_json, notes_json) VALUES ('global', @refreshedAt, @access, @notes)
     ON CONFLICT(id) DO UPDATE SET refreshed_at = @refreshedAt, access_json = @access, notes_json = @notes`,
  ).run({ refreshedAt: state.refreshedAt, access: JSON.stringify(state.access), notes: JSON.stringify(state.notes) });
}

export function statsRemoteIds(): Map<string, string> {
  const rows = db.prepare("SELECT id, stats_remote_id FROM publications WHERE stats_remote_id IS NOT NULL").all() as { id: string; stats_remote_id: string }[];
  return new Map(rows.map((r) => [r.id, r.stats_remote_id]));
}

export function setStatsRemoteId(publicationId: string, remoteId: string | null): void {
  db.prepare("UPDATE publications SET stats_remote_id = ? WHERE id = ?").run(remoteId, publicationId);
}

// --- AI reports ---

interface ReportRow {
  id: string;
  created_at: string;
  status: string;
  model: string | null;
  focus: string | null;
  report_json: string | null;
  error: string | null;
  content_count: number;
  measured_count: number;
}

function toRecord(r: ReportRow): AiReportRecord {
  return {
    id: r.id,
    createdAt: r.created_at,
    status: r.status as AiReportRecord["status"],
    model: r.model,
    focus: r.focus,
    report: r.report_json ? (JSON.parse(r.report_json) as AiReport) : null,
    error: r.error,
    contentCount: r.content_count,
    measuredCount: r.measured_count,
  };
}

export function createReport(input: { model: string | null; focus: string | null; contentCount: number; measuredCount: number }): AiReportRecord {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO ai_reports (id, created_at, status, model, focus, content_count, measured_count) VALUES (?, ?, 'running', ?, ?, ?, ?)",
  ).run(id, new Date().toISOString(), input.model, input.focus, input.contentCount, input.measuredCount);
  return getReport(id)!;
}

export function finishReport(id: string, report: AiReport, counts: { contentCount: number; measuredCount: number }): void {
  db.prepare("UPDATE ai_reports SET status = 'done', report_json = ?, content_count = ?, measured_count = ? WHERE id = ?").run(
    JSON.stringify(report),
    counts.contentCount,
    counts.measuredCount,
    id,
  );
}

export function failReport(id: string, error: string): void {
  db.prepare("UPDATE ai_reports SET status = 'error', error = ? WHERE id = ?").run(error, id);
}

export function getReport(id: string): AiReportRecord | null {
  const row = db.prepare("SELECT * FROM ai_reports WHERE id = ?").get(id) as ReportRow | undefined;
  return row ? toRecord(row) : null;
}

export function listReports(limit = 20): AiReportRecord[] {
  return (db.prepare("SELECT * FROM ai_reports ORDER BY created_at DESC LIMIT ?").all(limit) as ReportRow[]).map(toRecord);
}
