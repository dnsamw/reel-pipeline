import { APP_HOST } from "./salesBlock";
import { PLANNER_PLATFORMS, postTargets, type PlannerPlatform, type PlannerPost } from "./planner";

/**
 * P6 (docs/16 §9): the same post on Instagram, TikTok and YouTube Shorts,
 * posted by hand from the week pack (owner 2026-11-19). The caption is the
 * Facebook caption with small changes by code, never by AI:
 *
 * - Instagram, TikTok: links in captions can't be tapped, so the link line
 *   says "(link in bio)" (the URL stays, people can type it).
 * - YouTube Shorts: a title (the hook, at most 100 characters) and the
 *   caption as the description.
 * - First comments are a Facebook thing (COMMENTS.md); Instagram gets the
 *   same comment when the post has one, TikTok and YouTube don't.
 */

export const PLATFORM_LABELS: Record<PlannerPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

/** Caption limits (characters) we keep under; longer ones are flagged in the pack, not cut. */
export const CAPTION_LIMITS: Record<PlannerPlatform, number> = { facebook: 60_000, instagram: 2200, tiktok: 2200, youtube: 5000 };
export const YOUTUBE_TITLE_MAX = 100;
export const LINK_IN_BIO = "(link in bio)";

export interface PlatformCaption {
  platform: PlannerPlatform;
  /** YouTube only. */
  title: string | null;
  caption: string;
  /** Gets the post's first comment (Facebook, Instagram). */
  comment: boolean;
  /** Caption longer than the platform takes. */
  tooLong: boolean;
}

const hasLink = (line: string) => line.includes(APP_HOST);

/** A title for YouTube: the hook (or title), one line, at most 100 characters, cut at a word. */
export function youtubeTitle(p: Pick<PlannerPost, "hook" | "title">): string {
  const t = (p.hook || p.title || "StudyPal").replace(/\s+/g, " ").trim();
  if (t.length <= YOUTUBE_TITLE_MAX) return t;
  const cut = t.slice(0, YOUTUBE_TITLE_MAX - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), 60)).trim()}…`;
}

export function platformCaption(p: Pick<PlannerPost, "caption" | "hook" | "title">, platform: PlannerPlatform): PlatformCaption {
  let caption = p.caption.trim();
  if (platform === "instagram" || platform === "tiktok")
    caption = caption
      .split("\n")
      .map((l) => (hasLink(l) && !l.includes(LINK_IN_BIO) ? `${l.trimEnd()} ${LINK_IN_BIO}` : l))
      .join("\n");
  return {
    platform,
    title: platform === "youtube" ? youtubeTitle(p) : null,
    caption,
    comment: platform === "facebook" || platform === "instagram",
    tooLong: caption.length > CAPTION_LIMITS[platform],
  };
}

/** Captions for every platform the post goes to, in platform order. */
export const postCaptions = (p: Pick<PlannerPost, "caption" | "hook" | "title" | "kind" | "targets">): PlatformCaption[] =>
  postTargets(p).map((x) => platformCaption(p, x));

export { PLANNER_PLATFORMS };
