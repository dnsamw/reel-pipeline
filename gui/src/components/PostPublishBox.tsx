import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import type { FacebookStatus } from "../types";

let statusCache: Promise<FacebookStatus> | null = null;

/**
 * "Publish to Facebook" for one exported Post Creator file (PNG or MP4). It
 * always publishes the exact file that was exported and is shown above it -
 * never a fresh render - so `stale` warns when the post has been edited since.
 * The server picks photo / Reel / Page video from the file itself.
 */
export function PostPublishBox({
  savedPath,
  templateId,
  suggestedCaption,
  kind,
  stale,
  previewUrl,
}: {
  savedPath: string;
  templateId: string;
  suggestedCaption: string;
  kind: "image" | "reel";
  stale: boolean;
  /** Object URL of the exported file - shown in the confirm dialog so it's clear exactly what goes out. */
  previewUrl: string;
}) {
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [caption, setCaption] = useState(suggestedCaption);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<{ permalink: string | null; format: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    statusCache ??= api.facebookStatus();
    statusCache.then(setStatus, () => (statusCache = null));
  }, []);

  // A new export is a new thing to publish: fresh caption, no old result.
  useEffect(() => {
    setCaption(suggestedCaption);
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPath]);

  const page = status?.page ?? null;

  async function onPublish() {
    if (!page) return;
    setConfirming(false);
    setPublishing(true);
    setError(null);
    try {
      const pub = await api.publishPost({ savedPath, caption, templateId });
      setResult({ permalink: pub.fbPermalink, format: pub.format });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPublishing(false);
    }
  }

  if (status && !page) {
    return (
      <p className="hint post-publish-box">
        To publish to Facebook, connect a Page in <Link to="/settings">Settings</Link>.
      </p>
    );
  }

  return (
    <div className="post-publish-box">
      <ConfirmDialog
        open={confirming}
        title={kind === "image" ? "Publish this image?" : "Publish this reel?"}
        confirmLabel="Publish"
        onConfirm={onPublish}
        onCancel={() => setConfirming(false)}
      >
        <div className="publish-confirm">
          {kind === "image" ? <img src={previewUrl} alt="" /> : <video src={previewUrl} muted playsInline />}
          <div className="publish-confirm-info">
            <p>
              It will be posted publicly to <strong>{page?.name}</strong>
              .
            </p>
            {caption.trim() ? <p className="publish-confirm-caption">{caption}</p> : <p className="hint">No caption.</p>}
            {stale && <p className="hint post-publish-stale">You've edited the post since this export. This publishes the older export.</p>}
          </div>
        </div>
      </ConfirmDialog>
      <div className="field">
        <label>Facebook caption</label>
        <textarea rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} disabled={!!result} />
      </div>
      {stale && !result && <p className="hint post-publish-stale">You've edited the post since this export. Export again to publish the latest version.</p>}
      {error && <div className="error-banner">{error}</div>}
      {result ? (
        <div className="success-banner">
          Published to {page?.name} as {result.format === "photo" ? "a photo post" : result.format === "reel" ? "a Reel" : "a video"}.{" "}
          {result.permalink && (
            <a href={result.permalink} target="_blank" rel="noreferrer">
              View on Facebook
            </a>
          )}
          {result.format === "reel" && <span className="hint"> Reels can take a minute or two to finish processing.</span>}
        </div>
      ) : (
        <div className="button-row" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => setConfirming(true)} disabled={publishing || !page}>
            {publishing ? "Publishing…" : page ? `Publish to ${page.name}` : "Publish to Facebook"}
          </button>
        </div>
      )}
    </div>
  );
}
