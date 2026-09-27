import type { PostInsets } from "./types";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920;

/**
 * Where content should stay clear of on a 1080x1920 Facebook Reel/Story, in
 * reel pixels - measured from a real list-story reel on an iPhone 17 Pro plus
 * Meta's safe-zone guidance:
 * - top: status bar, back/search/more icons (~14%)
 * - bottom: account name, audio, caption and comment bar (~20%)
 * - sides: tall phones (19.5:9) fill the height and crop ~98px off each side
 * - right: extra room for the like/comment/share/save button column
 * Each value already includes a little breathing room past the overlay edge.
 */
export const REEL_SAFE_INSETS: PostInsets = { top: 270, right: 200, bottom: 380, left: 150 };

export const NO_INSETS: PostInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * REEL_SAFE_INSETS translated into a template's own pixel space, assuming the
 * post is scaled to fit and centred on the 1080x1920 reel canvas (exactly
 * what server/postReel.ts does). A 9:16 template gets the insets as-is; a
 * square post sits in the middle of the canvas, clear of the top/bottom
 * overlays, so it only needs the side insets.
 */
export function reelSafeInsets(width: number, height: number): PostInsets {
  const scale = Math.min(REEL_WIDTH / width, REEL_HEIGHT / height);
  const ox = (REEL_WIDTH - width * scale) / 2;
  const oy = (REEL_HEIGHT - height * scale) / 2;
  const toPost = (canvasInset: number, offset: number) => Math.max(0, Math.round((canvasInset - offset) / scale));
  return {
    top: toPost(REEL_SAFE_INSETS.top, oy),
    right: toPost(REEL_SAFE_INSETS.right, ox),
    bottom: toPost(REEL_SAFE_INSETS.bottom, oy),
    left: toPost(REEL_SAFE_INSETS.left, ox),
  };
}

export function postInsets(width: number, height: number, safeZones: boolean): PostInsets {
  return safeZones ? reelSafeInsets(width, height) : NO_INSETS;
}
