import { useEffect, useMemo, useState } from "react";
import { Shuffle } from "lucide-react";
import { api } from "../api";
import type { BookOutline, PostSource, SourceLineKind, SourceLineWithUse } from "../plannerTypes";

/**
 * Source picker in the post editor (docs/16 §4, P2): which book lines a post
 * uses. Lines already used by another post inside the repeat window (90 days)
 * can't be ticked; the server refuses them too.
 */

const KIND_LABEL: Record<SourceLineKind, string> = {
  phrase: "Phrase",
  mistake: "Mistake → right",
  example: "Example",
  hook: "Story hook",
  tip: "Tip",
};

function usedLabel(l: SourceLineWithUse): string {
  const u = l.usedBy;
  if (!u) return "";
  return u.date ? `used ${u.date} ${u.slotId ?? ""}` : "used in a reserve post";
}

export function SourcePicker({
  book,
  date,
  postId,
  source,
  onChange,
}: {
  book: string;
  /** The post's day (null for reserve: checked as if it went out today). */
  date: string | null;
  postId?: string;
  source: PostSource;
  onChange: (source: PostSource) => void;
}) {
  const [outline, setOutline] = useState<BookOutline | null>(null);
  const [lines, setLines] = useState<SourceLineWithUse[] | null>(null);
  const [count, setCount] = useState(5);
  const [kind, setKind] = useState<SourceLineKind | "">("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unit = source.book === book ? (source.unit ?? "") : "";
  const picked = useMemo(() => new Set((source.lines ?? []).map((l) => l.id)), [source.lines]);
  const isGrammar = book.startsWith("grammar-");

  useEffect(() => {
    setOutline(null);
    setError(null);
    if (!book) return;
    let live = true;
    api
      .plannerSource(book)
      .then((o) => live && setOutline(o))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [book]);

  useEffect(() => {
    setLines(null);
    if (!book || !unit) return;
    let live = true;
    api
      .plannerSourceLines(book, unit, date, postId)
      .then((l) => live && setLines(l))
      .catch((err) => live && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, [book, unit, date, postId]);

  const unitInfo = useMemo(() => outline?.groups.flatMap((g) => g.units).find((u) => u.id === unit), [outline, unit]);

  function chooseUnit(id: string) {
    const u = outline?.groups.flatMap((g) => g.units).find((x) => x.id === id);
    // Lines belong to one unit: a new unit starts an empty pick.
    onChange(u ? { book, unit: u.id, unitTitle: u.title, free: u.free, lines: [] } : {});
  }

  function toggle(l: SourceLineWithUse) {
    const cur = source.lines ?? [];
    const next = picked.has(l.id) ? cur.filter((x) => x.id !== l.id) : [...cur, { id: l.id, text: l.text }];
    onChange({ ...source, book, unit, unitTitle: unitInfo?.title ?? source.unitTitle, free: unitInfo?.free ?? source.free, lines: next });
  }

  async function pickForMe() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.plannerSuggest(book, { date, count, postId, kind: kind || undefined });
      if (!s) {
        setError(`No unit of this book has ${count} unused ${kind ? `${KIND_LABEL[kind].toLowerCase()} ` : ""}lines left in the 90-day window.`);
        return;
      }
      onChange({ book: s.book, unit: s.unit, unitTitle: s.unitTitle, free: s.free, lines: s.lines.map((l) => ({ id: l.id, text: l.text })) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!book) {
    return (
      <div className="planner-source">
        <label>Source lines</label>
        <p className="hint">Pick a book to use its lines.</p>
      </div>
    );
  }

  return (
    <div className="planner-source">
      <div className="planner-source-head">
        <label>Source lines</label>
        {(source.lines?.length ?? 0) > 0 && (
          <span className="hint">
            {source.lines!.length} picked{source.free ? " · free unit" : ""}{" "}
            <button type="button" className="link-button" onClick={() => onChange({ ...source, lines: [] })}>
              clear
            </button>
          </span>
        )}
      </div>
      {error && <div className="error-banner">{error}</div>}
      <div className="planner-editor-row">
        <div className="field" style={{ flex: 3 }}>
          <select value={unit} onChange={(e) => chooseUnit(e.target.value)} disabled={!outline} aria-label="Unit">
            <option value="">{outline ? "Pick a section / lesson…" : "Loading…"}</option>
            {outline?.groups.map((g) => (
              <optgroup key={g.id} label={`${g.id}. ${g.title}`}>
                {g.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.free ? "★ " : ""}
                    {u.title}
                    {u.count !== null ? ` (${u.count})` : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
      <div className="planner-source-pick">
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
          aria-label="How many lines"
        />
        <span className="hint">lines</span>
        {isGrammar && (
          <select value={kind} onChange={(e) => setKind(e.target.value as SourceLineKind | "")} aria-label="Kind of line">
            <option value="">any kind</option>
            {(["mistake", "example", "hook", "tip"] as const).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        )}
        <button type="button" className="secondary" onClick={pickForMe} disabled={busy}>
          <Shuffle size={14} /> {busy ? "Picking…" : "Pick for me"}
        </button>
      </div>
      <p className="hint">★ = free in the app (good for "try it" posts). Free units are picked first.</p>

      {unit && !lines && !error && <p className="hint">Loading lines…</p>}
      {lines && (
        <ul className="planner-source-lines">
          {lines.map((l) => {
            const used = !!l.usedBy && !picked.has(l.id);
            return (
              <li key={l.id} className={`${picked.has(l.id) ? "is-picked" : ""} ${used ? "is-used" : ""}`}>
                <label>
                  <input type="checkbox" checked={picked.has(l.id)} disabled={used} onChange={() => toggle(l)} />
                  <span className="planner-source-text">
                    {l.wrong && <s className="planner-source-wrong">{l.wrong}</s>}
                    <strong>{l.text}</strong>
                    {l.meaning && <span className="planner-source-meaning">{l.meaning}</span>}
                    {(l.note || used || l.kind !== "phrase") && (
                      <span className="hint">
                        {l.kind !== "phrase" ? `${KIND_LABEL[l.kind]}${used || l.note ? " · " : ""}` : ""}
                        {used ? <span className="text-danger">{usedLabel(l)}{l.usedBy?.title ? ` ("${l.usedBy.title}")` : ""}</span> : l.note}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
