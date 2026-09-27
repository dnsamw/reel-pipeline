import { randomUUID } from "node:crypto";
import { db } from "./db";
import type { CaptionMeta } from "../src/captions/types";

export type PublishPlatform = "facebook" | "instagram" | "youtube" | "tiktok";

export type PublishOutcome = "live" | "draft" | "private" | "unlisted";

export interface PublicationRecord {
  id: string;
  platform: PublishPlatform;
  batchId: string;
  template: string;
  outputPath: string;
  pageId: string;
  pageName: string;
  fbVideoId: string | null;
  fbPermalink: string | null;
  status: "uploading" | "published" | "error";
  /** For status "published": whether it's live, waiting in the creator's drafts (TikTok), or uploaded private/unlisted (YouTube). null = live (older rows). */
  outcome: PublishOutcome | null;
  /** Live progress text while status is "uploading" (e.g. "Processing on Instagram"). */
  stage: string | null;
  error: string | null;
  caption: string;
  /** How the caption was produced (built-in/AI/manual, tone, hook) - null for rows from before this was tracked. */
  captionMeta: CaptionMeta | null;
  createdAt: string;
  publishedAt: string | null;
}

interface PublicationRow {
  id: string;
  outcome: string | null;
  platform: string;
  stage: string | null;
  batch_id: string;
  template: string;
  output_path: string;
  page_id: string;
  page_name: string;
  fb_video_id: string | null;
  fb_permalink: string | null;
  status: string;
  error: string | null;
  caption: string;
  caption_meta: string | null;
  created_at: string;
  published_at: string | null;
}

function rowToRecord(row: PublicationRow): PublicationRecord {
  return {
    id: row.id,
    platform: (row.platform ?? "facebook") as PublishPlatform,
    stage: row.stage ?? null,
    outcome: (row.outcome ?? null) as PublishOutcome | null,
    batchId: row.batch_id,
    template: row.template,
    outputPath: row.output_path,
    pageId: row.page_id,
    pageName: row.page_name,
    fbVideoId: row.fb_video_id,
    fbPermalink: row.fb_permalink,
    status: row.status as PublicationRecord["status"],
    error: row.error,
    caption: row.caption,
    captionMeta: row.caption_meta ? (JSON.parse(row.caption_meta) as CaptionMeta) : null,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export function listPublications(): PublicationRecord[] {
  const rows = db.prepare("SELECT * FROM publications ORDER BY created_at DESC").all() as PublicationRow[];
  return rows.map(rowToRecord);
}

export function createPublication(input: {
  platform?: PublishPlatform;
  batchId: string;
  template: string;
  outputPath: string;
  pageId: string;
  pageName: string;
  caption: string;
  captionMeta?: CaptionMeta | null;
}): PublicationRecord {
  const record: PublicationRecord = {
    id: randomUUID(),
    ...input,
    platform: input.platform ?? "facebook",
    captionMeta: input.captionMeta ?? null,
    stage: null,
    outcome: null,
    fbVideoId: null,
    fbPermalink: null,
    status: "uploading",
    error: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };
  db.prepare(
    `INSERT INTO publications (id, platform, batch_id, template, output_path, page_id, page_name, fb_video_id, fb_permalink, status, stage, error, caption, caption_meta, created_at, published_at)
     VALUES (@id, @platform, @batchId, @template, @outputPath, @pageId, @pageName, NULL, NULL, @status, NULL, NULL, @caption, @captionMetaJson, @createdAt, NULL)`,
  ).run({ ...record, captionMetaJson: record.captionMeta ? JSON.stringify(record.captionMeta) : null });
  return record;
}

export function markPublished(id: string, fbVideoId: string, fbPermalink: string, outcome: PublishOutcome = "live"): PublicationRecord {
  const publishedAt = new Date().toISOString();
  db.prepare(
    "UPDATE publications SET status = 'published', stage = NULL, outcome = ?, fb_video_id = ?, fb_permalink = ?, published_at = ? WHERE id = ?",
  ).run(outcome, fbVideoId, fbPermalink, publishedAt, id);
  return rowToRecord(db.prepare("SELECT * FROM publications WHERE id = ?").get(id) as PublicationRow);
}

export function markError(id: string, error: string): PublicationRecord {
  db.prepare("UPDATE publications SET status = 'error', stage = NULL, error = ? WHERE id = ?").run(error, id);
  return rowToRecord(db.prepare("SELECT * FROM publications WHERE id = ?").get(id) as PublicationRow);
}

export function getPublication(id: string): PublicationRecord | null {
  const row = db.prepare("SELECT * FROM publications WHERE id = ?").get(id) as PublicationRow | undefined;
  return row ? rowToRecord(row) : null;
}

/** Progress text for a running background publish (the GUI polls it). */
export function markStage(id: string, stage: string): void {
  db.prepare("UPDATE publications SET stage = ? WHERE id = ? AND status = 'uploading'").run(stage, id);
}

/**
 * A server restart kills in-flight publish jobs - anything still "uploading"
 * at startup can never finish, so mark it failed instead of leaving the GUI
 * spinning forever.
 */
export function failInterruptedPublications(): void {
  db.prepare(
    "UPDATE publications SET status = 'error', stage = NULL, error = 'Interrupted by a server restart - publish again' WHERE status = 'uploading'",
  ).run();
}
