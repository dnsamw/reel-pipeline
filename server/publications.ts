import { randomUUID } from "node:crypto";
import { db } from "./db";

export interface PublicationRecord {
  id: string;
  batchId: string;
  template: string;
  outputPath: string;
  pageId: string;
  pageName: string;
  fbVideoId: string | null;
  fbPermalink: string | null;
  status: "uploading" | "published" | "error";
  error: string | null;
  caption: string;
  createdAt: string;
  publishedAt: string | null;
}

interface PublicationRow {
  id: string;
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
  created_at: string;
  published_at: string | null;
}

function rowToRecord(row: PublicationRow): PublicationRecord {
  return {
    id: row.id,
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
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export function listPublications(): PublicationRecord[] {
  const rows = db.prepare("SELECT * FROM publications ORDER BY created_at DESC").all() as PublicationRow[];
  return rows.map(rowToRecord);
}

export function createPublication(input: {
  batchId: string;
  template: string;
  outputPath: string;
  pageId: string;
  pageName: string;
  caption: string;
}): PublicationRecord {
  const record: PublicationRecord = {
    id: randomUUID(),
    ...input,
    fbVideoId: null,
    fbPermalink: null,
    status: "uploading",
    error: null,
    createdAt: new Date().toISOString(),
    publishedAt: null,
  };
  db.prepare(
    `INSERT INTO publications (id, batch_id, template, output_path, page_id, page_name, fb_video_id, fb_permalink, status, error, caption, created_at, published_at)
     VALUES (@id, @batchId, @template, @outputPath, @pageId, @pageName, NULL, NULL, @status, NULL, @caption, @createdAt, NULL)`,
  ).run(record);
  return record;
}

export function markPublished(id: string, fbVideoId: string, fbPermalink: string): PublicationRecord {
  const publishedAt = new Date().toISOString();
  db.prepare("UPDATE publications SET status = 'published', fb_video_id = ?, fb_permalink = ?, published_at = ? WHERE id = ?").run(
    fbVideoId,
    fbPermalink,
    publishedAt,
    id,
  );
  return rowToRecord(db.prepare("SELECT * FROM publications WHERE id = ?").get(id) as PublicationRow);
}

export function markError(id: string, error: string): PublicationRecord {
  db.prepare("UPDATE publications SET status = 'error', error = ? WHERE id = ?").run(error, id);
  return rowToRecord(db.prepare("SELECT * FROM publications WHERE id = ?").get(id) as PublicationRow);
}
