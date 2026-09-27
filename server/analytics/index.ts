import { listPublications } from "../publications";
import { aiStatus } from "../ai/client";
import { collectFacebook, collectInstagram, collectTikTok, collectYouTube, type CollectResult, type TikTokVideo } from "./collectors";
import { allPhrases, buildContentPieces, durationOf, usedPhraseIds } from "./content";
import { compare, coverage, predict, scorePieces, suggest } from "./analysis";
import { aiAsk, aiReport } from "./ai";
import {
  createReport,
  failReport,
  finishReport,
  getReport,
  getState,
  listPlatformPosts,
  listReports,
  savePlatformPosts,
  saveState,
  setStatsRemoteId,
  statsRemoteIds,
} from "./store";
import type { AiReportRecord, InsightsOverview, StatsAccess, StatsPlatform } from "../../src/analytics/types";
import type { Phrase } from "../../src/data/getPhrases";

/**
 * Insights: reads every post on each connected account (not only the ones
 * this app published), builds the built-in analysis, and optionally asks
 * Kimi for analysis, predictions and a content plan. See docs/ARCHITECTURE.md "Insights".
 */

const PLATFORMS: StatsPlatform[] = ["facebook", "instagram", "youtube", "tiktok"];
const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;

let refreshing: Promise<void> | null = null;

/**
 * TikTok uploads land as drafts; the creator posts them later in the app and
 * the posted video gets a new id. Each unlinked draft is matched to the
 * earliest unclaimed video posted after the upload with a similar length.
 * Links set by hand are never overwritten.
 */
function autoLinkTikTok(): void {
  const drafts = listPublications()
    .filter((p) => p.platform === "tiktok" && p.status === "published")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const links = statsRemoteIds();
  const claimed = new Set(links.values());
  const videos = listPlatformPosts().filter((p) => p.platform === "tiktok");
  for (const pub of drafts) {
    if (links.has(pub.id)) continue;
    const d = durationOf(pub.outputPath);
    const match = videos
      .filter((v) => !claimed.has(v.remoteId) && v.createdAt >= pub.createdAt)
      .filter((v) => d == null || v.durationSeconds == null || Math.abs(v.durationSeconds - d) <= 2)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (match) {
      claimed.add(match.remoteId);
      setStatsRemoteId(pub.id, match.remoteId);
    }
  }
}

async function doRefresh(): Promise<void> {
  const safe = async (platform: StatsPlatform, run: () => Promise<CollectResult>): Promise<CollectResult> => {
    try {
      return await run();
    } catch (err) {
      console.error(`[insights] ${platform} refresh failed:`, err);
      return { access: { platform, connected: true, level: "none", fix: err instanceof Error ? err.message : String(err) }, posts: [], complete: false };
    }
  };
  const results = await Promise.all([
    safe("facebook", collectFacebook),
    safe("instagram", collectInstagram),
    safe("youtube", collectYouTube),
    safe("tiktok", collectTikTok),
  ]);

  const fetchedAt = new Date().toISOString();
  for (const r of results) if (r.posts.length || r.complete) savePlatformPosts(r.access.platform, r.posts, r.complete, fetchedAt);
  autoLinkTikTok();
  saveState({ refreshedAt: fetchedAt, access: results.map((r) => r.access), notes: {} });
}

/** Refreshes every platform's posts and stats; concurrent calls share one run. */
export function refreshStats(): Promise<void> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

async function phrasesOrEmpty(): Promise<Phrase[]> {
  try {
    return await allPhrases();
  } catch (err) {
    console.warn("[insights] phrase DB unavailable:", err);
    return [];
  }
}

export async function getOverview(): Promise<InsightsOverview> {
  const state = getState();
  const known = new Map(state.access.map((a) => [a.platform, a]));
  const access: StatsAccess[] = PLATFORMS.map(
    (p) => known.get(p) ?? { platform: p, connected: false, level: "none", fix: state.refreshedAt ? "Not connected - connect it in Settings." : "Not checked yet - press Refresh stats." },
  );

  const pubs = listPublications();
  const posts = listPlatformPosts();
  const phrases = await phrasesOrEmpty();
  const pieces = buildContentPieces(pubs, posts, statsRemoteIds(), access, phrases);
  const measuredCount = scorePieces(pieces);
  const comparisons = compare(pieces);
  const cov = phrases.length ? coverage(phrases, usedPhraseIds(pubs, posts, phrases)) : [];

  return {
    refreshedAt: state.refreshedAt,
    refreshing: refreshing != null,
    access,
    contents: pieces,
    comparisons,
    suggestions: suggest(pieces, comparisons, cov, access, measuredCount),
    predictions: predict(pieces),
    coverage: cov,
    measuredCount,
  };
}

// --- TikTok draft -> posted video links ---

export function recentTikTokVideos(): TikTokVideo[] {
  return listPlatformPosts()
    .filter((p) => p.platform === "tiktok")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => ({ id: p.remoteId, createTime: p.createdAt, description: p.caption ?? p.title ?? "", durationSeconds: p.durationSeconds, shareUrl: p.permalink }));
}

export function linkTikTok(publicationId: string, videoId: string | null): void {
  const pub = listPublications().find((p) => p.id === publicationId);
  if (!pub || pub.platform !== "tiktok") throw new Error("That isn't a TikTok publication");
  setStatsRemoteId(publicationId, videoId);
}

// --- AI ---

export function startAiReport(focus: string | null): AiReportRecord {
  const status = aiStatus();
  if (!status.available) throw new Error("No AI key is set - add NVIDIA_API_KEY to .env and restart the server. The built-in analysis below works without it.");
  if (listReports(1)[0]?.status === "running") throw new Error("A report is already being written - wait for it to finish");

  // The record is created before the (async) overview so the GUI can start polling at once.
  const record = createReport({ model: status.model, focus, contentCount: 0, measuredCount: 0 });
  void (async () => {
    try {
      const overview = await getOverview();
      const phrases = await phrasesOrEmpty();
      const report = await aiReport(overview, phrases, usedPhraseIds(listPublications(), listPlatformPosts(), phrases), focus);
      finishReport(record.id, report, { contentCount: overview.contents.length, measuredCount: overview.measuredCount });
    } catch (err) {
      console.error("[insights] AI report failed:", err);
      failReport(record.id, err instanceof Error ? err.message : String(err));
    }
  })();
  return record;
}

export async function askAi(question: string): Promise<string> {
  if (!aiStatus().available) throw new Error("No AI key is set - add NVIDIA_API_KEY to .env and restart the server");
  const overview = await getOverview();
  const phrases = await phrasesOrEmpty();
  return aiAsk(overview, phrases, usedPhraseIds(listPublications(), listPlatformPosts(), phrases), question);
}

export { getReport, listReports };

/** Refreshes on startup when stats are older than 6h, then every 6h while the server runs. */
export function startInsightsScheduler(): void {
  const tick = () => {
    const last = getState().refreshedAt;
    if (!last || Date.now() - Date.parse(last) >= AUTO_REFRESH_MS - 60_000) refreshStats().catch((err) => console.error("[insights] auto refresh failed:", err));
  };
  setTimeout(tick, 30_000);
  setInterval(tick, AUTO_REFRESH_MS).unref();
}
