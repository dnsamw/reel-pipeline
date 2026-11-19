import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { api } from "../api";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { LibraryItem, LibraryKind, LibraryListing } from "../types";

const TABS: { kind: LibraryKind; label: string; hint: string }[] = [
  {
    kind: "reel",
    label: "Batch reels",
    hint: "Reels from Batch Render / Queue Render (output/). Deleting one also removes its manifest entry, so that batch counts as not rendered again.",
  },
  { kind: "post", label: "Post exports", hint: "PNGs and reels exported from Post Creator (output/posts/)." },
  { kind: "ad", label: "Ad exports", hint: "Ad images and videos exported from Ad Creator (output/ads/), named {TEMPLATE}_{PRODUCT}_{FORMAT}_{VARIANT}." },
  {
    kind: "image",
    label: "Uploaded images",
    hint: "Images uploaded for recipes, posts and ads (assets/images/). Deleting one that's still in use leaves a missing image wherever it's used.",
  },
];

type Pending = { type: "delete"; items: LibraryItem[] } | { type: "reset" } | { type: "prune" } | null;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Browse and clean up everything the GUI generates or stores: batch-rendered
 * reels, Post Creator exports, uploaded images - plus the render manifest
 * that tracks which batches are "rendered". All destructive actions go
 * through ConfirmDialog.
 */
export function MediaLibrary() {
  const [data, setData] = useState<LibraryListing | null>(null);
  const [tab, setTab] = useState<LibraryKind>("reel");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function reload() {
    api
      .library()
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(reload, []);

  const items = useMemo(() => (data?.items ?? []).filter((i) => i.kind === tab), [data, tab]);
  const counts = useMemo(() => {
    const c: Record<LibraryKind, number> = { reel: 0, post: 0, ad: 0, image: 0 };
    for (const i of data?.items ?? []) c[i.kind]++;
    return c;
  }, [data]);
  const selectedItems = items.filter((i) => selected.has(i.id));
  const allSelected = items.length > 0 && selectedItems.length === items.length;

  function switchTab(kind: LibraryKind) {
    setTab(kind);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)));
  }

  async function run(action: () => Promise<string>) {
    setPending(null);
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      setStatus(await action());
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      reload();
    }
  }

  function confirmPending() {
    if (!pending) return;
    if (pending.type === "delete") {
      const ids = pending.items.map((i) => i.id);
      run(async () => {
        const r = await api.deleteLibraryItems(ids);
        const parts = [`Deleted ${r.deleted.length} file${r.deleted.length === 1 ? "" : "s"}`];
        if (r.manifestEntriesRemoved) parts.push(`removed ${r.manifestEntriesRemoved} manifest entr${r.manifestEntriesRemoved === 1 ? "y" : "ies"}`);
        if (r.errors.length) parts.push(`${r.errors.length} failed: ${r.errors.map((e) => e.error).join("; ")}`);
        return parts.join(", ") + ".";
      });
    } else if (pending.type === "reset") {
      run(async () => {
        const r = await api.resetManifest();
        return `Manifest reset - ${r.cleared} entr${r.cleared === 1 ? "y" : "ies"} cleared.${r.backupPath ? ` Backup saved to ${r.backupPath}.` : ""}`;
      });
    } else {
      run(async () => {
        const r = await api.pruneManifest();
        return `Removed ${r.removed} manifest entr${r.removed === 1 ? "y" : "ies"} pointing at missing files.`;
      });
    }
  }

  const tabInfo = TABS.find((t) => t.kind === tab)!;

  return (
    <div>
      <h1>Media Library</h1>
      {error && <div className="error-banner">{error}</div>}
      {status && <div className="success-banner">{status}</div>}

      <div className="card">
        <h2>Render manifest</h2>
        <p className="library-text">
          <code>output/manifest.json</code> tracks which batches are already rendered, so Batch Render skips them and Queue Render
          lists them under "Rendered".
          {data && (
            <>
              {" "}
              It has <strong>{data.manifest.entries}</strong> entr{data.manifest.entries === 1 ? "y" : "ies"}
              {data.manifest.missingFiles > 0 && (
                <>
                  , <strong>{data.manifest.missingFiles}</strong> pointing at a video that no longer exists
                </>
              )}
              .
            </>
          )}
        </p>
        <div className="button-row">
          <button type="button" className="secondary" disabled={busy || !data?.manifest.missingFiles} onClick={() => setPending({ type: "prune" })}>
            Remove missing entries
          </button>
          <button type="button" className="danger" disabled={busy || !data?.manifest.entries} onClick={() => setPending({ type: "reset" })}>
            Reset manifest…
          </button>
        </div>
      </div>

      <div className="card">
        <div className="segmented library-tabs">
          {TABS.map((t) => (
            <button key={t.kind} type="button" className={tab === t.kind ? "active" : ""} onClick={() => switchTab(t.kind)}>
              {t.label} ({counts[t.kind]})
            </button>
          ))}
        </div>
        <p className="hint library-tab-hint">{tabInfo.hint}</p>

        <div className="library-toolbar">
          <label className="library-select-all">
            <input type="checkbox" checked={allSelected} disabled={items.length === 0} onChange={toggleAll} />
            Select all
          </label>
          <span className="hint library-selection">
            {selectedItems.length > 0
              ? `${selectedItems.length} selected · ${formatBytes(selectedItems.reduce((n, i) => n + i.sizeBytes, 0))}`
              : `${items.length} file${items.length === 1 ? "" : "s"} · ${formatBytes(items.reduce((n, i) => n + i.sizeBytes, 0))}`}
          </span>
          <button type="button" className="danger" disabled={busy || selectedItems.length === 0} onClick={() => setPending({ type: "delete", items: selectedItems })}>
            Delete selected
          </button>
        </div>

        {!data ? (
          <p className="hint library-text">Loading…</p>
        ) : items.length === 0 ? (
          <p className="hint library-text">Nothing here.</p>
        ) : (
          <div className="library-grid">
            {items.map((item) => (
              <LibraryCard key={item.id} item={item} selected={selected.has(item.id)} onToggle={() => toggle(item.id)} />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pending != null}
        tone="danger"
        title={
          pending?.type === "delete"
            ? `Delete ${pending.items.length} file${pending.items.length === 1 ? "" : "s"}?`
            : pending?.type === "reset"
              ? "Reset the render manifest?"
              : "Remove missing manifest entries?"
        }
        confirmLabel={pending?.type === "delete" ? "Delete" : pending?.type === "reset" ? "Reset manifest" : "Remove entries"}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      >
        {pending?.type === "delete" && <DeleteSummary items={pending.items} />}
        {pending?.type === "reset" && (
          <div className="library-confirm">
            <p>
              All {data?.manifest.entries} entries are cleared, so every batch counts as <strong>not rendered</strong>: the next Batch Render
              renders them again and Queue Render lists them under "Not yet".
            </p>
            <p className="hint">Rendered videos are kept. A backup of the current manifest is saved next to it first.</p>
          </div>
        )}
        {pending?.type === "prune" && (
          <div className="library-confirm">
            <p>
              Removes the {data?.manifest.missingFiles} entr{data?.manifest.missingFiles === 1 ? "y" : "ies"} whose video file no longer
              exists. Entries with a video are kept.
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

function DeleteSummary({ items }: { items: LibraryItem[] }) {
  const shown = items.slice(0, 5);
  const published = items.filter((i) => i.published).length;
  const tracked = items.filter((i) => i.manifest).length;
  const inUse = items.filter((i) => i.usedBy && i.usedBy.length > 0);
  return (
    <div className="library-confirm">
      <p>
        This permanently deletes {items.length === 1 ? "this file" : "these files"} from disk ({formatBytes(items.reduce((n, i) => n + i.sizeBytes, 0))}):
      </p>
      <ul className="library-confirm-list">
        {shown.map((i) => (
          <li key={i.id}>{i.path}</li>
        ))}
        {items.length > shown.length && <li className="hint">…and {items.length - shown.length} more</li>}
      </ul>
      {tracked > 0 && (
        <p className="hint">
          {tracked} {tracked === 1 ? "is a tracked batch reel" : "are tracked batch reels"}: the manifest entr{tracked === 1 ? "y is" : "ies are"} removed
          too, so {tracked === 1 ? "that batch counts" : "those batches count"} as not rendered.
        </p>
      )}
      {published > 0 && (
        <p className="hint">
          {published} {published === 1 ? "was" : "were"} published to Facebook. Deleting the file doesn't remove the Facebook post.
        </p>
      )}
      {inUse.length > 0 && (
        <p className="hint library-warning">
          Still in use: {inUse.map((i) => `${i.name} (${i.usedBy!.join(", ")})`).join("; ")}. Those will show a missing image.
        </p>
      )}
    </div>
  );
}

function LibraryCard({ item, selected, onToggle }: { item: LibraryItem; selected: boolean; onToggle: () => void }) {
  return (
    <div className={`library-card${selected ? " selected" : ""}`} onClick={onToggle}>
      <div className="library-thumb">
        {item.mediaType === "video" ? (
          // #t= shows a real frame instead of a black first frame; no controls so a click selects.
          <video src={`${item.url}#t=0.5`} preload="metadata" muted playsInline />
        ) : (
          <img src={item.url} alt="" loading="lazy" />
        )}
        <input type="checkbox" className="library-check" checked={selected} onChange={onToggle} onClick={(e) => e.stopPropagation()} />
        <a className="library-open" href={item.url} target="_blank" rel="noreferrer" title="Open in a new tab" onClick={(e) => e.stopPropagation()}>
          <ExternalLink size={14} />
        </a>
      </div>
      <div className="library-meta">
        <div className="library-name" title={item.path}>
          {item.manifest?.chapterTitle ?? item.name}
        </div>
        {item.manifest && <div className="hint library-sub">{item.name}</div>}
        <div className="hint library-sub">
          {formatBytes(item.sizeBytes)} · {new Date(item.modifiedAt).toLocaleString()}
        </div>
        <div className="library-badges">
          {item.kind === "reel" && (item.manifest ? <span className="badge done">Tracked</span> : <span className="badge queued">Untracked</span>)}
          {item.published && <span className="badge done">Published</span>}
          {item.usedBy && item.usedBy.length > 0 && (
            <span className="badge running" title={item.usedBy.join("\n")}>
              In use ({item.usedBy.length})
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
