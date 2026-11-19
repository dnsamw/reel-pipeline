import { useEffect, useState } from "react";
import { api, type StockPhoto } from "../api";

/**
 * "Find a free photo" under a post's image field: searches Pexels through the
 * server (server/stockPhotos.ts), and a click downloads the photo into
 * assets/images/ and sets the field to it. Collapsed until opened, and
 * explains how to enable it when PEXELS_API_KEY isn't set.
 */
export function StockPhotoPicker({ onPick, onError, orientation = "portrait" }: { onPick: (path: string) => void; onError: (msg: string) => void; orientation?: string }) {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [photos, setPhotos] = useState<StockPhoto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<number | null>(null);

  useEffect(() => {
    if (!open || available !== null) return;
    api
      .stockStatus()
      .then((s) => setAvailable(s.available))
      .catch(() => setAvailable(false));
  }, [open, available]);

  async function search(nextPage: number) {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const res = await api.searchStock(query.trim(), nextPage, orientation);
      setPhotos((cur) => (nextPage === 1 ? res.photos : [...cur, ...res.photos]));
      setPage(nextPage);
      setHasMore(res.hasMore);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pick(photo: StockPhoto) {
    setImporting(photo.id);
    try {
      const { path } = await api.importStock(photo);
      onPick(path);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(null);
    }
  }

  if (!open) {
    return (
      <button type="button" className="secondary small" style={{ justifySelf: "start" }} onClick={() => setOpen(true)}>
        Find a free photo…
      </button>
    );
  }

  return (
    <div className="stock-picker" style={{ display: "grid", gap: 8 }}>
      {available === false ? (
        <span className="hint">
          Free photo search needs a Pexels API key: get one free at pexels.com/api, add <code>PEXELS_API_KEY=…</code> to <code>.env</code>, and restart the GUI server.
        </span>
      ) : (
        <>
          <div className="post-image-field">
            <input
              type="text"
              value={query}
              placeholder="e.g. city street, student, coffee, sunset"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search(1)}
            />
            <button type="button" className="secondary" disabled={busy || !query.trim()} onClick={() => search(1)}>
              {busy && page === 1 ? "Searching…" : "Search"}
            </button>
          </div>
          {photos.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(96px, 1fr))", gap: 6, maxHeight: 360, overflowY: "auto" }}>
              {photos.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={`${p.alt || "Photo"} - by ${p.photographer} (Pexels)`}
                  onClick={() => pick(p)}
                  disabled={importing !== null}
                  style={{ padding: 0, border: "none", background: "none", cursor: "pointer", aspectRatio: "4 / 5", overflow: "hidden", borderRadius: 6, opacity: importing === p.id ? 0.5 : 1 }}
                >
                  <img src={p.thumb} alt={p.alt} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                </button>
              ))}
            </div>
          )}
          <div className="button-row" style={{ margin: 0 }}>
            {hasMore && (
              <button type="button" className="secondary small" disabled={busy} onClick={() => search(page + 1)}>
                {busy ? "Loading…" : "More photos"}
              </button>
            )}
            <button type="button" className="secondary small" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <span className="hint">{importing !== null ? "Downloading the photo…" : "Photos by Pexels - free to use. Click one to use it."}</span>
        </>
      )}
    </div>
  );
}
