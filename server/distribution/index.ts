import { createPublication, getPublication, markError, markPublished, markStage, type PublicationRecord, type PublishPlatform } from "../publications";
import { facebookAdapter } from "./facebookAdapter";
import { instagramAdapter } from "./instagramAdapter";
import { youtubeAdapter } from "./youtubeAdapter";
import { tiktokAdapter } from "./tiktokAdapter";
import { probeMedia, resolveSourcePath, sourceKey, type PublishSource } from "./media";
import type { MediaFile, PlatformAdapter, PlatformStatus } from "./types";
import type { CaptionMeta } from "../../src/captions/types";

/**
 * Multi-platform publishing ("distribution"). Every platform is a
 * PlatformAdapter (types.ts); this file lists them, says which ones a given
 * file can go to, and runs publishes as background jobs whose progress lands
 * on the publication rows the GUI polls.
 */
const adapters: PlatformAdapter[] = [facebookAdapter, instagramAdapter, youtubeAdapter, tiktokAdapter];

/** Planned next - listed so Settings can show them, but not publishable yet. */
const upcoming: PlatformStatus[] = [
];

export function platformStatuses(): PlatformStatus[] {
  return [...adapters.map((a) => a.status()), ...upcoming];
}

function adapterFor(platform: string): PlatformAdapter {
  const a = adapters.find((x) => x.platform === platform);
  if (!a) throw new Error(`Publishing to "${platform}" isn't available yet`);
  return a;
}

export interface TargetOption extends PlatformStatus {
  /** Why this file can't go to this platform (unsupported format/length, not connected...). null = ready. */
  unavailableReason: string | null;
}

/** For the Publish panel: every platform with whether *this* file can be published there right now. */
export function targetsFor(source: PublishSource): { media: Omit<MediaFile, "absPath">; targets: TargetOption[] } {
  const media = probeMedia(resolveSourcePath(source));
  const targets = platformStatuses().map((status) => {
    let unavailableReason: string | null = null;
    // "Can this platform take this file at all?" beats "is it connected?" - no point connecting YouTube for an image.
    if (!status.available) unavailableReason = "Coming soon";
    else unavailableReason = adapterFor(status.platform).unsupportedReason(media) ?? (status.connected ? null : "Not connected - connect it in Settings");
    return { ...status, unavailableReason };
  });
  const { absPath: _abs, ...publicMedia } = media;
  return { media: publicMedia, targets };
}

export interface PublishTarget {
  platform: PublishPlatform;
  caption: string;
  title?: string;
  /** YouTube visibility; ignored elsewhere. */
  privacy?: "private" | "unlisted" | "public";
  captionMeta?: CaptionMeta | null;
}

/**
 * Validates every target up front (so nothing half-starts on a bad request),
 * creates one publication row per platform, then publishes them in the
 * background - concurrently, since they're independent services. Returns the
 * rows immediately; the GUI polls GET /api/publications/:id for progress.
 */
export function startPublishing(source: PublishSource, targets: PublishTarget[]): PublicationRecord[] {
  if (targets.length === 0) throw new Error("Pick at least one platform");
  const media = probeMedia(resolveSourcePath(source));
  const key = sourceKey(source, media);

  const planned = targets.map((t) => {
    const adapter = adapterFor(t.platform);
    const status = adapter.status();
    if (!status.connected) throw new Error(`${adapter.label} isn't connected - connect it in Settings`);
    const reason = adapter.unsupportedReason(media);
    if (reason) throw new Error(`${adapter.label}: ${reason}`);
    return { t, adapter, status };
  });

  return planned.map(({ t, adapter, status }) => {
    const record = createPublication({
      platform: adapter.platform,
      batchId: key.batchId,
      template: key.template,
      outputPath: media.relPath,
      pageId: status.accountName ?? adapter.platform,
      pageName: status.accountName ?? adapter.label,
      caption: t.caption,
      captionMeta: t.captionMeta ?? null,
    });
    void runJob(record.id, adapter, media, t);
    return getPublication(record.id)!;
  });
}

async function runJob(id: string, adapter: PlatformAdapter, media: MediaFile, target: PublishTarget): Promise<void> {
  try {
    markStage(id, "Starting");
    const result = await adapter.publish(media, { caption: target.caption, title: target.title, privacy: target.privacy }, (stage) => markStage(id, stage));
    markPublished(id, result.remoteId, result.permalink ?? "", result.outcome ?? "live");
  } catch (err) {
    console.error(`[publish ${adapter.platform}]`, err);
    markError(id, err instanceof Error ? err.message : String(err));
  }
}
