import { getConnectedPage, publishPhotoToConnectedPage, publishReelToConnectedPage, publishVideoToConnectedPage } from "../facebook";
import { isVertical916 } from "./media";
import type { PlatformAdapter } from "./types";

/**
 * The connected Facebook Page (server/facebook.ts does the Graph calls).
 * Images go up as photo posts; a 9:16 video of 3-90s as a Reel (Reels'
 * limits); any other video as a regular Page video.
 */
export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",
  label: "Facebook",

  status() {
    const page = getConnectedPage();
    return {
      platform: "facebook",
      label: "Facebook",
      connected: page != null,
      accountName: page?.name ?? null,
      setupHint: page ? null : "Connect the Facebook Page you admin.",
      available: true,
    };
  },

  unsupportedReason() {
    return null; // photos, Reels and regular videos all work
  },

  async publish(media, { caption }, onStage) {
    onStage("Uploading to Facebook");
    if (media.kind === "image") {
      const r = await publishPhotoToConnectedPage(media.absPath, caption);
      return { remoteId: r.id, permalink: r.permalink };
    }
    const asReel = isVertical916(media) && media.durationSeconds! >= 3 && media.durationSeconds! <= 90;
    const r = asReel ? await publishReelToConnectedPage(media.absPath, caption) : await publishVideoToConnectedPage(media.absPath, caption);
    return { remoteId: r.videoId, permalink: r.permalink };
  },
};
