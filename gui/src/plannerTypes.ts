/** Mirrors server/planner.ts and server/lmsCatalog.ts (docs/16 in studypal-lms). */

export const POST_STATUSES = ["idea", "drafted", "approved", "rendered", "scheduled", "published", "measured", "rejected", "failed"] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
export const STOCK_STATUSES: readonly PostStatus[] = ["approved", "rendered", "scheduled", "published", "measured"];

export const POST_KINDS = ["reel", "image", "carousel", "video"] as const;
export type PostKind = (typeof POST_KINDS)[number];

export interface PlannerSlot {
  id: string;
  label: string;
  timeFrom: string;
  timeTo: string;
  kind: PostKind;
  note: string;
  sort: number;
  active: boolean;
}

export interface Pillar {
  id: string;
  name: string;
  subject: string;
  color: string;
  books: string[];
  landingPath: string;
  sharePct: number;
  slotIds: string[];
  needsOwner: boolean;
  note: string;
  sort: number;
  active: boolean;
}

export interface PlannerPost {
  id: string;
  date: string | null;
  slotId: string | null;
  reserve: boolean;
  pillarId: string | null;
  book: string;
  kind: PostKind;
  title: string;
  hook: string;
  caption: string;
  photo: string;
  mediaPath: string;
  source: Record<string, unknown>;
  status: PostStatus;
  statusReason: string;
  autoApproved: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockLevel {
  today: string;
  fullDays: number;
  streakDays: number;
  stockPosts: number;
  reservePosts: number;
  targetDays: number;
  level: "ok" | "warning" | "red";
  needsYou: number;
}

export interface CatalogBook {
  slug: string;
  no: number;
  subject: string;
  title: string;
  titleSi: string;
}

export interface PlannerView {
  today: string;
  from: string;
  to: string;
  slots: PlannerSlot[];
  pillars: Pillar[];
  posts: PlannerPost[];
  reserve: PlannerPost[];
  stock: StockLevel;
  mix: { pillarId: string; posts: number; pct: number; targetPct: number }[];
  books: CatalogBook[];
}

export type PlannerPostInput = Partial<Omit<PlannerPost, "id" | "createdAt" | "updatedAt" | "autoApproved">>;
