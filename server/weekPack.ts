import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { listPillars, listPosts, listSlots, type PlannerPost, type Slot } from "./planner";

/**
 * P3 week pack (studypal-lms docs/16 §2 step 7): the rendered posts of a date
 * range as numbered files in posting order, with captions, first comments and
 * a checklist page, for scheduling by hand in Meta Business Suite. No API
 * posting (docs/16 §7).
 */

export function socialMediaDir(): string {
  return resolve(process.env.SOCIAL_MEDIA_DIR ?? join(process.cwd(), "..", "studypal-lms", "social-media"));
}
const exportsDir = () => join(socialMediaDir(), "facebook-page", "exports");
const firstCommentDir = () => join(socialMediaDir(), "..", "marketing", "first-comment");

// --- Posting time inside the slot window ---

const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * A fixed time for the post inside its slot (5-minute steps), taken from the
 * post id, so the Page doesn't post at the same minute every day and a
 * re-export gives the same time.
 */
export function postTime(postId: string, slot: Pick<Slot, "timeFrom" | "timeTo">): string {
  const from = toMin(slot.timeFrom);
  const steps = Math.max(1, Math.floor((toMin(slot.timeTo) - from) / 5));
  const n = createHash("sha1").update(postId).digest().readUInt32BE(0) % steps;
  return toHHMM(from + n * 5);
}

// --- First comment (marketing/first-comment/COMMENTS.md) ---

export interface FirstComment {
  variant: string;
  text: string;
  /** Image to post with the comment (absolute), if it exists. */
  image: string | null;
}

const VARIANT_IMAGES: Record<string, string> = {
  A: "out/feed/pack-all.png",
  B: "out/feed/sentence.png",
  C: "../campaign-abroad/out/square/card-1.png",
  D: "out/feed/pack-all.png",
  E: "out/feed/pack-phrase.png",
  F: "out/feed/pack-grammar.png",
};

export function loadFirstComments(): Map<string, FirstComment> {
  const out = new Map<string, FirstComment>();
  const file = join(firstCommentDir(), "COMMENTS.md");
  if (!existsSync(file)) return out;
  const md = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  for (const m of md.matchAll(/^## Variant ([A-Z]):[^\n]*\n[\s\S]*?```\n([\s\S]*?)\n```/gm)) {
    const img = VARIANT_IMAGES[m[1]] ? join(firstCommentDir(), VARIANT_IMAGES[m[1]]) : null;
    out.set(m[1], { variant: m[1], text: m[2].trim(), image: img && existsSync(img) ? img : null });
  }
  return out;
}

/**
 * Which comment goes under a post (COMMENTS.md "How to post it"): only image
 * posts; abroad/travel → C, grammar → F, other English posts rotate A/B/D/E.
 * Japanese, Korean, monk and brand posts get none (the comments sell the
 * English packs).
 */
export function commentVariant(post: Pick<PlannerPost, "kind" | "pillarId">, subject: string, englishIndex: number): string | null {
  if (post.kind !== "image" && post.kind !== "carousel") return null;
  if (post.pillarId === "working-abroad" || post.pillarId === "travel") return "C";
  if (subject === "grammar") return "F";
  if (subject === "english") return ["A", "B", "D", "E"][englishIndex % 4];
  return null;
}

// --- The pack ---

export interface PackItem {
  n: number;
  postId: string;
  date: string;
  time: string;
  slotId: string;
  kind: string;
  title: string;
  caption: string;
  media: string;
  /** File name in the pack. */
  file: string;
  comment: { variant: string; text: string; image: string | null } | null;
}

export interface PackPlan {
  from: string;
  to: string;
  items: PackItem[];
  /** In the range but not ready to schedule. */
  missing: { postId: string; date: string; slotId: string | null; title: string; reason: string }[];
  alreadyScheduled: number;
}

function resolveMedia(p: string): string | null {
  if (!p.trim() || /^https?:|^facebook:/.test(p)) return null;
  const abs = isAbsolute(p) ? p : resolve(process.cwd(), p);
  return existsSync(abs) && statSync(abs).isFile() ? abs : null;
}

export function planWeekPack(from: string, to: string): PackPlan {
  const slots = new Map(listSlots().map((s) => [s.id, s]));
  const pillars = new Map(listPillars().map((p) => [p.id, p]));
  const comments = loadFirstComments();
  const plan: PackPlan = { from, to, items: [], missing: [], alreadyScheduled: 0 };
  const ready: { post: PlannerPost; slot: Slot; time: string; media: string }[] = [];

  for (const post of listPosts(from, to)) {
    const base = { postId: post.id, date: post.date!, slotId: post.slotId, title: post.title || post.hook || "(untitled)" };
    if (post.status === "scheduled") {
      plan.alreadyScheduled++;
      continue;
    }
    if (["published", "measured", "rejected"].includes(post.status)) continue;
    const slot = post.slotId ? slots.get(post.slotId) : undefined;
    if (!slot) {
      plan.missing.push({ ...base, reason: "No slot" });
      continue;
    }
    if (post.status !== "rendered") {
      plan.missing.push({ ...base, reason: post.status === "approved" ? "Approved, not rendered yet" : `Still ${post.status}` });
      continue;
    }
    const media = resolveMedia(post.mediaPath);
    if (!media) {
      plan.missing.push({ ...base, reason: `Media file not found: ${post.mediaPath}` });
      continue;
    }
    if (!post.caption.trim()) {
      plan.missing.push({ ...base, reason: "No caption" });
      continue;
    }
    ready.push({ post, slot, time: postTime(post.id, slot), media });
  }

  ready.sort((a, b) => a.post.date!.localeCompare(b.post.date!) || a.time.localeCompare(b.time));
  let english = 0;
  ready.forEach(({ post, slot, time, media }, i) => {
    const n = i + 1;
    const subject = (post.pillarId && pillars.get(post.pillarId)?.subject) || "";
    const variant = commentVariant(post, subject, english);
    if (variant && variant !== "C" && subject === "english") english++;
    const c = variant ? comments.get(variant) : undefined;
    const stem = `${String(n).padStart(2, "0")}_${post.date}_${time.replace(":", "")}_${post.kind}`;
    plan.items.push({
      n,
      postId: post.id,
      date: post.date!,
      time,
      slotId: slot.id,
      kind: post.kind,
      title: post.title || post.hook || "(untitled)",
      caption: post.caption,
      media,
      file: `${stem}${extname(media).toLowerCase()}`,
      comment: c ? { variant: c.variant, text: c.text, image: c.image } : null,
    });
  });
  return plan;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function checklistHtml(plan: PackPlan, files: Map<number, { comment: string | null }>): string {
  const rows = plan.items
    .map((it) => {
      const isVideo = /\.(mp4|mov|webm)$/i.test(it.file);
      const media = isVideo ? `<video src="${esc(it.file)}" controls muted></video>` : `<img src="${esc(it.file)}" alt="">`;
      const cImg = files.get(it.n)?.comment;
      const comment = it.comment
        ? `<h4>First comment (variant ${it.comment.variant})${cImg ? ` + <a href="${esc(cImg)}">image</a>` : ""}</h4><pre>${esc(it.comment.text)}</pre><button data-copy>Copy comment</button>`
        : "";
      return `<section><label class="done"><input type="checkbox"> scheduled</label>
<div class="when">${it.n}. ${esc(it.date)} · <b>${esc(it.time)}</b> · ${esc(it.slotId)} · ${esc(it.kind)}</div>
<div class="grid"><div class="media">${media}<div class="file">${esc(it.file)}</div></div>
<div><h3>${esc(it.title)}</h3><pre>${esc(it.caption)}</pre><button data-copy>Copy caption</button>${comment}</div></div></section>`;
    })
    .join("\n");
  const missing = plan.missing.length
    ? `<h2>Not in this pack (${plan.missing.length})</h2><ul>${plan.missing.map((m) => `<li>${esc(m.date)} ${esc(m.slotId ?? "")}: ${esc(m.title)} (${esc(m.reason)})</li>`).join("")}</ul>`
    : "";
  return `<!DOCTYPE html><html lang="si"><head><meta charset="utf-8"><title>Week pack ${esc(plan.from)} to ${esc(plan.to)}</title>
<style>body{font:15px/1.45 system-ui,"Noto Sans Sinhala",sans-serif;max-width:1100px;margin:24px auto;padding:0 16px;color:#1d1626}
section{border:1px solid #e4dfec;border-radius:12px;padding:14px;margin:14px 0}section.is-done{opacity:.45}
.grid{display:grid;grid-template-columns:300px 1fr;gap:16px}.media img,.media video{width:100%;border-radius:8px}
.file{font:12px monospace;color:#6b6470;margin-top:4px;word-break:break-all}.when{font-size:14px;margin-bottom:8px}
pre{white-space:pre-wrap;background:#f7f4fa;padding:10px;border-radius:8px;font:inherit}h3{margin:0 0 6px}h4{margin:12px 0 4px}
button{background:#58238b;color:#fff;border:0;border-radius:8px;padding:6px 12px;cursor:pointer}.done{float:right}</style></head><body>
<h1>Week pack: ${esc(plan.from)} to ${esc(plan.to)}</h1>
<p>${plan.items.length} posts, in posting order. Times are <b>Sri Lanka time</b>. In Meta Business Suite → Planner, for each post: upload the file, paste the caption, set the day and time, schedule. Right after it goes out, add the first comment from the Page (rotate; never the same text twice in a row). Then tick <i>scheduled</i> here and press <b>Mark scheduled</b> in Studio's Planner.</p>
${rows}
${missing}
<script>document.querySelectorAll("[data-copy]").forEach(b=>{const label=b.textContent;b.onclick=()=>{navigator.clipboard.writeText(b.previousElementSibling.textContent);b.textContent="Copied";setTimeout(()=>b.textContent=label,1200)}});
document.querySelectorAll(".done input").forEach((c,i)=>{const k="pack:"+location.pathname+":"+i;c.checked=localStorage[k]==="1";c.closest("section").classList.toggle("is-done",c.checked);c.onchange=()=>{localStorage[k]=c.checked?"1":"0";c.closest("section").classList.toggle("is-done",c.checked)}});</script>
</body></html>`;
}

export interface PackResult extends PackPlan {
  /** Absolute folder the pack was written to. */
  dir: string;
}

/** Writes the pack to social-media/facebook-page/exports/week-<from>[_n]/. A new folder each time, nothing is overwritten. */
export function exportWeekPack(from: string, to: string): PackResult {
  const plan = planWeekPack(from, to);
  if (plan.items.length === 0) throw new Error("Nothing to export: no rendered posts with a caption in this range");
  mkdirSync(exportsDir(), { recursive: true });
  let dir = join(exportsDir(), `week-${from}`);
  for (let i = 2; existsSync(dir); i++) dir = join(exportsDir(), `week-${from}_${i}`);
  mkdirSync(dir);
  const files = new Map<number, { comment: string | null }>();
  for (const it of plan.items) {
    copyFileSync(it.media, join(dir, it.file));
    const stem = it.file.slice(0, -extname(it.file).length);
    writeFileSync(join(dir, `${stem}_caption.txt`), `${it.caption.trim()}\n`, "utf8");
    let commentImage: string | null = null;
    if (it.comment) {
      writeFileSync(join(dir, `${stem}_comment.txt`), `${it.comment.text}\n`, "utf8");
      if (it.comment.image) {
        commentImage = `${stem}_comment${extname(it.comment.image)}`;
        copyFileSync(it.comment.image, join(dir, commentImage));
      }
    }
    files.set(it.n, { comment: commentImage });
  }
  writeFileSync(join(dir, "index.html"), checklistHtml(plan, files), "utf8");
  const manifest = {
    from,
    to,
    exportedAt: new Date().toISOString(),
    timeZone: "Asia/Colombo",
    items: plan.items.map((it) => ({ ...it, media: basename(it.media), comment: it.comment ? { variant: it.comment.variant, image: files.get(it.n)?.comment ?? null } : null })),
    missing: plan.missing,
  };
  writeFileSync(join(dir, "pack.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { ...plan, dir };
}

/** Folder path for messages, relative to the StudyPal workspace when possible. */
export const showDir = (dir: string) => relative(resolve(socialMediaDir(), "..", ".."), dir) || dir;
