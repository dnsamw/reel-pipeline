import { relative } from "node:path";
import { listCatalogBooks } from "./lmsCatalog";
import { renderPostPng } from "./postRenderer";
import { getPost, listPosts, updatePost, type PlannerPost } from "./planner";
import { stockPhotoPath } from "./photoPicker";
import { renderPlannerReel } from "./planReel";

/**
 * Automatic rendering of approved Planner image posts (docs/16 §2 step 6):
 * the "Hook photo + long caption" Post Creator template, with the post's
 * stock photo, its hook in the box and the book in the top pill. The lines,
 * the offer and the link stay in the caption. Reels are not rendered here
 * (the reel renderer reads the legacy phrase DB and spends TTS quota).
 */

export const PLANNER_IMAGE_TEMPLATE = "studypal-hook-photo";
/** Rendered reels are stored here; the folder name is how a reel's "template" is recognised. */
export const PLANNER_REEL_TEMPLATE = "planner-reels/";
export const RENDERABLE_KINDS = new Set(["image", "reel"]);

/** The stock photo through this server, so the render's Chrome loads it from disk without copying. */
const photoUrl = (photo: string) =>
  `http://localhost:${process.env.GUI_SERVER_PORT ?? 4300}/api/planner/stock-image?${new URLSearchParams({ path: photo })}`;

/** "Working Abroad: Visas, Interviews & Jobs" → "Working Abroad"; JP/KO books get their J/K number. */
function bookPill(slug: string): string {
  const b = listCatalogBooks().find((x) => x.slug === slug);
  if (!b) return "";
  const short = b.title.split(":")[0].trim();
  const n = /^(japanese|korean)-([jk]\d)$/.exec(b.slug);
  return n ? `${n[2].toUpperCase()} · ${short}` : short;
}

/** Why a post can't be rendered automatically, or null. */
export function renderBlocker(p: PlannerPost): string | null {
  if (!RENDERABLE_KINDS.has(p.kind)) return `${p.kind} posts are rendered by hand`;
  if (p.status !== "approved" && p.status !== "rendered") return `status is ${p.status}`;
  if (p.kind === "reel") return (p.source.lines?.length ?? 0) > 0 ? null : "no book lines";
  if (!p.photo || !stockPhotoPath(p.photo)) return "no stock photo";
  if (!p.hook.trim()) return "no hook";
  return null;
}

export async function renderPlannerPost(id: string, by = "auto", log: (l: string) => void = () => {}): Promise<PlannerPost> {
  const p = getPost(id);
  if (!p) throw new Error("Post not found");
  const blocker = renderBlocker(p);
  if (blocker) throw new Error(`Can't render: ${blocker}`);
  if (p.kind === "reel") {
    // Silent reel with music only (owner 2026-11-18): no TTS quota is spent.
    const mediaPath = await renderPlannerReel(p, log);
    return updatePost(id, { mediaPath, status: "rendered", statusReason: "" }, by);
  }
  const lines = p.source.lines?.length ?? 0;
  const { savedPath } = await renderPostPng({
    templateId: PLANNER_IMAGE_TEMPLATE,
    fields: {
      image: photoUrl(p.photo),
      // A little darkening so the white box and pills stand out on any photo.
      overlayOpacity: "18",
      hook: p.hook.trim(),
      hookSize: "84",
      topPill: bookPill(p.book),
      topPillArrow: "none",
      pointer: lines > 1 ? `වාක්‍ය ${lines}ම පහළින්` : "විස්තර පහළින්",
      brand: "StudyPal",
    },
    lists: {},
    colors: {},
  });
  const mediaPath = relative(process.cwd(), savedPath).split("\\").join("/");
  return updatePost(id, { mediaPath, status: "rendered", statusReason: "" }, by);
}

/** Renders every approved image post in [from, to] that can be rendered; one at a time (Chrome is heavy). */
export async function renderApproved(from: string, to: string, log: (l: string) => void = () => {}): Promise<{ rendered: number; skipped: { id: string; reason: string }[] }> {
  const skipped: { id: string; reason: string }[] = [];
  let rendered = 0;
  for (const p of listPosts(from, to).filter((x) => x.status === "approved")) {
    const why = renderBlocker(p);
    if (why) {
      skipped.push({ id: p.id, reason: why });
      continue;
    }
    try {
      await renderPlannerPost(p.id, "auto", log);
      rendered++;
      log(`rendered ${p.date} ${p.slotId}`);
    } catch (err) {
      skipped.push({ id: p.id, reason: err instanceof Error ? err.message : String(err) });
      log(`render failed ${p.date} ${p.slotId}: ${(err instanceof Error ? err.message : String(err)).slice(0, 160)}`);
    }
  }
  return { rendered, skipped };
}

/**
 * Has the owner ever scheduled a post made with this template (the image
 * template's id, or the reel folder)? If not, its first use needs them
 * (docs/16 §10.1).
 */
export function templateUsedBefore(marker = `${PLANNER_IMAGE_TEMPLATE}-`): boolean {
  const all = listPosts("2000-01-01", "2999-12-31");
  return all.some((p) => p.mediaPath.includes(marker) && ["scheduled", "published", "measured"].includes(p.status));
}
