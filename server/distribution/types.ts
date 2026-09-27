import type { PublishPlatform } from "../publications";

/** A local file about to be published, as probed by media.ts. */
export interface MediaFile {
  absPath: string;
  /** Repo-relative, forward slashes - what's stored on the publication row. */
  relPath: string;
  kind: "image" | "video";
  width: number;
  height: number;
  /** null for images. */
  durationSeconds: number | null;
  sizeBytes: number;
}

export interface PlatformStatus {
  platform: PublishPlatform;
  label: string;
  connected: boolean;
  accountName: string | null;
  /** Shown under the platform in Settings when not connected - what's needed. */
  setupHint: string | null;
  /** False for platforms whose adapter isn't built yet (shown as "coming next"). */
  available: boolean;
  /** False when the server is missing this platform's app credentials (.env) - Connect can't work yet. */
  configured?: boolean;
}

export interface PublishOptions {
  caption: string;
  /** Platforms with a separate title field (YouTube). */
  title?: string;
  /** YouTube visibility - defaults to private. */
  privacy?: "private" | "unlisted" | "public";
}

export interface PublishResult {
  remoteId: string;
  permalink: string | null;
  /** Default "live". TikTok uploads land as "draft"; YouTube can be "private"/"unlisted". */
  outcome?: "live" | "draft" | "private" | "unlisted";
}

/**
 * One social platform. Every adapter answers the same three questions -
 * are we connected, can this file go there, and publish it - so the
 * publish flow, the GUI and the history table never special-case a
 * platform. Adding one = a new file implementing this + a registry entry.
 */
export interface PlatformAdapter {
  platform: PublishPlatform;
  label: string;
  status(): PlatformStatus;
  /** null when `media` can be published here; otherwise a short reason for the GUI. */
  unsupportedReason(media: MediaFile): string | null;
  /** `onStage` reports progress text ("Uploading", "Processing on Instagram"...) while it runs. */
  publish(media: MediaFile, options: PublishOptions, onStage: (stage: string) => void): Promise<PublishResult>;
}
