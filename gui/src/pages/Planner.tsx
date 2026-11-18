import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { api } from "../api";
import {
  POST_KINDS,
  POST_STATUSES,
  STOCK_STATUSES,
  type CatalogBook,
  type Pillar,
  type PlannerPost,
  type PlannerPostInput,
  type PlannerSlot,
  type PlannerView,
  type PostStatus,
} from "../plannerTypes";
import { SourcePicker } from "./PlannerSource";
import { WeekPack } from "./PlannerWeekPack";

/**
 * Planner: every social post on one calendar (docs/16-social-content-pipeline.md
 * in studypal-lms). Days are Sri Lanka days. Posting is done by hand in Meta
 * Business Suite, so "scheduled" and "published" are ticked here.
 */

const DAYS = 14;

const STATUS_LABEL: Record<PostStatus, string> = {
  idea: "Idea",
  drafted: "Drafted",
  approved: "Approved",
  rendered: "Rendered",
  scheduled: "Scheduled",
  published: "Published",
  measured: "Measured",
  rejected: "Rejected",
  failed: "Failed",
};

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(date: string): { weekday: string; day: string } {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
  };
}

type Tab = "calendar" | "reserve" | "pack" | "pillars" | "slots";

type Editing = { post: PlannerPostInput & { id?: string } } | null;

export function Planner() {
  const [view, setView] = useState<PlannerView | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("calendar");
  const [editing, setEditing] = useState<Editing>(null);
  const [error, setError] = useState<string | null>(null);

  function reload(start = from) {
    api
      .planner(start ?? undefined, start ? addDays(start, DAYS - 1) : undefined)
      .then((v) => {
        setView(v);
        if (!start) setFrom(v.from);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => reload(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function shift(days: number) {
    if (!from) return;
    const next = addDays(from, days);
    setFrom(next);
    reload(next);
  }

  function goToday() {
    if (!view) return;
    setFrom(view.today);
    reload(view.today);
  }

  if (!view || !from) {
    return (
      <div>
        <h1>Planner</h1>
        {error ? <div className="error-banner">{error}</div> : <p className="hint">Loading…</p>}
      </div>
    );
  }

  const days = Array.from({ length: DAYS }, (_, i) => addDays(from, i));
  const activeSlots = view.slots.filter((s) => s.active);
  const pillarById = new Map(view.pillars.map((p) => [p.id, p]));

  return (
    <div className="planner">
      <div className="planner-head">
        <h1>Planner</h1>
        <div className="segmented">
          {(["calendar", "reserve", "pack", "pillars", "slots"] as Tab[]).map((t) => (
            <button key={t} type="button" className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "calendar" ? "Calendar" : t === "reserve" ? `Reserve (${view.reserve.length})` : t === "pack" ? "Week pack & stats" : t === "pillars" ? "Pillars" : "Slots"}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="error-banner">{error}</div>}

      <StockCard view={view} />

      {tab === "calendar" && (
        <>
          <div className="planner-range">
            <button type="button" className="secondary icon-button" onClick={() => shift(-7)} title="Back a week">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="secondary" onClick={goToday}>
              Today
            </button>
            <button type="button" className="secondary icon-button" onClick={() => shift(7)} title="Forward a week">
              <ChevronRight size={16} />
            </button>
            <span className="hint">
              {dayLabel(days[0]).day} – {dayLabel(days[DAYS - 1]).day} · Sri Lanka time
            </span>
          </div>

          <div className="card planner-grid-card">
            <table className="planner-grid">
              <thead>
                <tr>
                  <th>Day</th>
                  {activeSlots.map((s) => (
                    <th key={s.id} title={s.note}>
                      {s.id} · {s.label}
                      <div className="planner-slot-time">
                        {s.timeFrom}–{s.timeTo} · {s.kind}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((date) => {
                  const { weekday, day } = dayLabel(date);
                  const isToday = date === view.today;
                  const isPast = date < view.today;
                  return (
                    <tr key={date} className={`${isToday ? "planner-today" : ""}${isPast ? " planner-past" : ""}`}>
                      <td className="planner-day">
                        <strong>{weekday}</strong> {day}
                        {weekday === "Sat" && <div className="planner-slot-time">batch session</div>}
                      </td>
                      {activeSlots.map((slot) => {
                        const cellPosts = view.posts.filter((p) => p.date === date && p.slotId === slot.id);
                        return (
                          <td key={slot.id} className="planner-cell">
                            {cellPosts.map((p) => (
                              <PostChip key={p.id} post={p} views={p.remoteId ? view.stats[p.remoteId]?.metrics.views : undefined} pillar={p.pillarId ? pillarById.get(p.pillarId) : undefined} onClick={() => setEditing({ post: p })} />
                            ))}
                            {cellPosts.length === 0 && (
                              <button
                                type="button"
                                className="planner-add"
                                title="Add a post here"
                                onClick={() => setEditing({ post: { date, slotId: slot.id, kind: slot.kind, status: "idea" } })}
                              >
                                <Plus size={14} />
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <MixCard view={view} />
        </>
      )}

      {tab === "reserve" && (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>
            Evergreen posts with no day yet. When a day is empty or a post is rejected, move one of these into the slot
            (open it and pick a day). Target: 10 approved reserve posts (docs/16 §7).
          </p>
          <div className="button-row" style={{ marginTop: 0 }}>
            <button type="button" onClick={() => setEditing({ post: { reserve: true, kind: "image", status: "idea" } })}>
              + New reserve post
            </button>
          </div>
          {view.reserve.length === 0 ? (
            <p className="hint">No reserve posts yet.</p>
          ) : (
            <div className="planner-reserve">
              {view.reserve.map((p) => (
                <PostChip key={p.id} post={p} views={p.remoteId ? view.stats[p.remoteId]?.metrics.views : undefined} pillar={p.pillarId ? pillarById.get(p.pillarId) : undefined} onClick={() => setEditing({ post: p })} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "pack" && <WeekPack view={view} onChanged={() => reload()} />}
      {tab === "pillars" && <PillarsEditor pillars={view.pillars} slots={view.slots} onSaved={() => reload()} onError={setError} />}
      {tab === "slots" && <SlotsEditor slots={view.slots} onSaved={() => reload()} onError={setError} />}

      {editing && (
        <PostEditor
          initial={editing.post}
          view={view}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function StockCard({ view }: { view: PlannerView }) {
  const s = view.stock;
  const pct = Math.min(100, Math.round((s.fullDays / s.targetDays) * 100));
  const levelText = s.level === "ok" ? "Stock OK" : s.level === "warning" ? "Stock low: plan a batch" : "Stock critical: the streak is at risk";
  return (
    <div className={`card planner-stock planner-stock-${s.level}`}>
      <div className="planner-stock-main">
        <div className="planner-stock-number">
          {s.fullDays}
          <span> / {s.targetDays} days</span>
        </div>
        <div className="planner-stock-label">{levelText}</div>
        <div className="bar-track planner-stock-bar">
          <div className="bar-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="planner-stock-facts">
        <div>
          <strong>{s.streakDays}</strong> days with at least 1 post (streak safe)
        </div>
        <div>
          <strong>{s.stockPosts}</strong> ready posts from today
        </div>
        <div>
          <strong>{s.reservePosts}</strong> reserve posts
        </div>
        <div className={s.needsYou > 0 ? "planner-needs-you" : ""}>
          <strong>{s.needsYou}</strong> need you (drafted or failed)
        </div>
      </div>
    </div>
  );
}

function MixCard({ view }: { view: PlannerView }) {
  const pillarById = new Map(view.pillars.map((p) => [p.id, p]));
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Mix in these {DAYS} days</h2>
      <div className="bar-list">
        {view.mix.map((m) => {
          const p = pillarById.get(m.pillarId);
          if (!p) return null;
          return (
            <div key={m.pillarId} className="planner-mix-row">
              <span className="planner-mix-name">
                <span className="planner-dot" style={{ background: p.color }} />
                {p.name}
              </span>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${m.pct}%`, background: p.color }} />
              </div>
              <span className="planner-mix-value">
                {m.posts} · {m.pct}% <span className="hint">(target {m.targetPct}%)</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PostChip({ post, pillar, views, onClick }: { post: PlannerPost; pillar?: Pillar; views?: number | null; onClick: () => void }) {
  const stock = STOCK_STATUSES.includes(post.status);
  return (
    <button
      type="button"
      className={`planner-chip planner-status-${post.status}${stock ? " planner-chip-stock" : ""}`}
      style={{ borderLeftColor: pillar?.color ?? "var(--border-strong)" }}
      onClick={onClick}
      title={post.statusReason || post.hook || post.title}
    >
      <span className="planner-chip-title">{post.title || post.hook || "(untitled)"}</span>
      <span className="planner-chip-meta">
        {pillar?.name ?? "No pillar"} · {post.kind}
        {post.source.lines?.length ? ` · ${post.source.lines.length} lines` : ""}
      </span>
      <span className="planner-chip-badges">
        <span className={`badge planner-badge-${post.status}`}>{STATUS_LABEL[post.status]}</span>
        {post.autoApproved && <span className="badge planner-badge-auto">auto</span>}
        {views != null && <span className="badge planner-badge-views">{views.toLocaleString()} views</span>}
      </span>
    </button>
  );
}

/** Changing the book drops lines picked from another book. */
function withBook<T extends PlannerPostInput>(cur: T, book: string): T {
  return { ...cur, book, source: cur.source?.book && cur.source.book !== book ? {} : (cur.source ?? {}) };
}

function PostEditor({ initial, view, onClose, onSaved }: { initial: PlannerPostInput & { id?: string }; view: PlannerView; onClose: () => void; onSaved: () => void }) {
  const [post, setPost] = useState<PlannerPostInput & { id?: string }>({
    title: "",
    hook: "",
    caption: "",
    photo: "",
    mediaPath: "",
    book: "",
    notes: "",
    statusReason: "",
    pillarId: null,
    source: {},
    ...initial,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isNew = !post.id;
  const pillar = view.pillars.find((p) => p.id === post.pillarId);

  const books: CatalogBook[] = useMemo(() => {
    if (!pillar) return view.books;
    if (pillar.books.length) return view.books.filter((b) => pillar.books.includes(b.slug));
    if (pillar.subject === "brand") return [];
    return view.books.filter((b) => b.subject === pillar.subject);
  }, [pillar, view.books]);

  const emptyCells = useMemo(() => {
    const out: { date: string; slotId: string }[] = [];
    const slots = view.slots.filter((s) => s.active);
    for (let i = 0; i < DAYS; i++) {
      const date = addDays(view.from, i);
      if (date < view.today) continue;
      for (const s of slots) if (!view.posts.some((p) => p.date === date && p.slotId === s.id)) out.push({ date, slotId: s.id });
    }
    return out;
  }, [view]);

  function set<K extends keyof PlannerPostInput>(key: K, value: PlannerPostInput[K]) {
    setPost((cur) => ({ ...cur, [key]: value }));
  }

  async function save(patch: PlannerPostInput = {}) {
    setBusy(true);
    setError(null);
    try {
      const { id, ...body } = { ...post, ...patch };
      if (id) await api.updatePlannerPost(id, body);
      else await api.createPlannerPost(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function reject() {
    const reason = prompt("Why is this post rejected? (Claude reads this when it writes the next week)", post.statusReason ?? "");
    if (reason === null) return;
    await save({ status: "rejected", statusReason: reason });
  }

  async function remove() {
    if (!post.id || !confirm("Delete this post? Rejecting keeps the reason for next week's drafts; deleting does not.")) return;
    await api.deletePlannerPost(post.id);
    onSaved();
  }

  async function useReserve(reserveId: string) {
    if (!post.date || !post.slotId) return;
    try {
      await api.fillFromReserve(reserveId, post.date, post.slotId);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const readyReserve = view.reserve.filter((r) => STOCK_STATUSES.includes(r.status));

  return (
    <div className="planner-editor">
      <div className="planner-editor-titlebar">
        <strong>{isNew ? "New post" : "Edit post"}</strong>
        <button type="button" className="secondary icon-button" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="planner-editor-body">
        {error && <div className="error-banner">{error}</div>}

        {isNew && !post.reserve && readyReserve.length > 0 && (
          <div className="field">
            <label>Fill this slot from the reserve</label>
            <select value="" onChange={(e) => e.target.value && useReserve(e.target.value)}>
              <option value="">Pick a reserve post…</option>
              {readyReserve.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title || r.hook || "(untitled)"}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="planner-editor-row">
          <label className="planner-check">
            <input type="checkbox" checked={!!post.reserve} onChange={(e) => set("reserve", e.target.checked)} /> Reserve (no day)
          </label>
        </div>

        {!post.reserve && (
          <div className="planner-editor-row">
            <div className="field">
              <label>Day</label>
              <input type="date" value={post.date ?? ""} onChange={(e) => set("date", e.target.value)} />
            </div>
            <div className="field">
              <label>Slot</label>
              <select value={post.slotId ?? ""} onChange={(e) => set("slotId", e.target.value)}>
                <option value="">—</option>
                {view.slots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.id} · {s.timeFrom} · {s.kind}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        {post.reserve && !isNew && emptyCells.length > 0 && (
          <div className="field">
            <label>Move into an empty slot</label>
            <select
              value=""
              onChange={(e) => {
                const [date, slotId] = e.target.value.split("|");
                if (date && slotId) save({ reserve: false, date, slotId });
              }}
            >
              <option value="">Pick a day and slot…</option>
              {emptyCells.map((c) => (
                <option key={`${c.date}|${c.slotId}`} value={`${c.date}|${c.slotId}`}>
                  {dayLabel(c.date).weekday} {dayLabel(c.date).day} · {c.slotId}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="planner-editor-row">
          <div className="field">
            <label>Pillar</label>
            <select
              value={post.pillarId ?? ""}
              onChange={(e) => {
                const next = view.pillars.find((p) => p.id === e.target.value);
                // A one-book pillar (Working Abroad, Travel, monk) fills in its book.
                setPost((cur) => withBook({ ...cur, pillarId: next?.id ?? null }, next?.books.length === 1 ? next.books[0] : (cur.book ?? "")));
              }}
            >
              <option value="">—</option>
              {view.pillars
                .filter((p) => p.active || p.id === post.pillarId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="field">
            <label>Book</label>
            <select value={post.book ?? ""} onChange={(e) => setPost((cur) => withBook(cur, e.target.value))}>
              <option value="">— (brand / any)</option>
              {books.map((b) => (
                <option key={b.slug} value={b.slug}>
                  {b.no}. {b.title}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Type</label>
            <select value={post.kind ?? "image"} onChange={(e) => set("kind", e.target.value as PlannerPostInput["kind"])}>
              {POST_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
        {pillar?.note && <p className="hint">{pillar.note}</p>}

        <SourcePicker
          book={post.book ?? ""}
          date={post.reserve ? null : (post.date ?? null)}
          postId={post.id}
          source={post.source ?? {}}
          // An empty title takes the unit title, so the calendar shows what the post is about.
          onChange={(source) => setPost((cur) => ({ ...cur, source, title: cur.title || source.unitTitle || "" }))}
        />

        <div className="field">
          <label>Title (for this list only)</label>
          <input type="text" value={post.title ?? ""} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div className="field">
          <label>Hook (on the image, ≤ 12 Sinhala words)</label>
          <input type="text" value={post.hook ?? ""} onChange={(e) => set("hook", e.target.value)} />
        </div>
        <div className="field">
          <label>Caption</label>
          <textarea rows={8} value={post.caption ?? ""} onChange={(e) => set("caption", e.target.value)} />
        </div>
        <div className="planner-editor-row">
          <div className="field">
            <label>Background photo (in stock-images/)</label>
            <input type="text" value={post.photo ?? ""} placeholder="japanese/_shared/places/…jpg" onChange={(e) => set("photo", e.target.value)} />
          </div>
          <div className="field">
            <label>Rendered file</label>
            <input type="text" value={post.mediaPath ?? ""} placeholder="output/…" onChange={(e) => set("mediaPath", e.target.value)} />
          </div>
        </div>
        {post.remoteId && (
          <div className="planner-fb">
            <div className="planner-fb-head">
              <strong>On Facebook</strong>
              {view.stats[post.remoteId]?.permalink && (
                <a href={view.stats[post.remoteId]!.permalink!} target="_blank" rel="noreferrer">
                  open post
                </a>
              )}
              <button
                type="button"
                className="link-button"
                title="Wrong match? Unlink it; Match now won't link it again unless the caption and day fit."
                onClick={() => save({ remoteId: null })}
              >
                unlink
              </button>
            </div>
            {view.stats[post.remoteId] ? (
              <div className="planner-fb-metrics">
                {(
                  [
                    ["views", "Views"],
                    ["reach", "Reach"],
                    ["likes", "Reactions"],
                    ["comments", "Comments"],
                    ["shares", "Shares"],
                  ] as const
                ).map(([k, label]) => (
                  <span key={k}>
                    <b>{view.stats[post.remoteId!]!.metrics[k]?.toLocaleString() ?? "–"}</b> {label}
                  </span>
                ))}
              </div>
            ) : (
              <p className="hint">Linked to {post.remoteId}; no numbers yet (refresh Insights or import the CSV).</p>
            )}
          </div>
        )}
        <div className="planner-editor-row">
          <div className="field">
            <label>Status</label>
            <select value={post.status ?? "idea"} onChange={(e) => set("status", e.target.value as PostStatus)}>
              {POST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: 2 }}>
            <label>Reason / what's missing</label>
            <input type="text" value={post.statusReason ?? ""} onChange={(e) => set("statusReason", e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea rows={2} value={post.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div className="button-row">
          <button type="button" disabled={busy} onClick={() => save()}>
            Save
          </button>
          {!isNew && post.status !== "approved" && (
            <button type="button" className="secondary" disabled={busy} onClick={() => save({ status: "approved", statusReason: "" })}>
              Approve
            </button>
          )}
          {!isNew && post.status === "rendered" && (
            <button type="button" className="secondary" disabled={busy} onClick={() => save({ status: "scheduled" })}>
              Mark scheduled
            </button>
          )}
          {!isNew && post.status === "scheduled" && (
            <button type="button" className="secondary" disabled={busy} onClick={() => save({ status: "published" })}>
              Mark published
            </button>
          )}
          {!isNew && post.status !== "rejected" && (
            <button type="button" className="secondary" disabled={busy} onClick={reject}>
              Reject…
            </button>
          )}
          {!isNew && (
            <button type="button" className="danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PillarsEditor({ pillars, slots, onSaved, onError }: { pillars: Pillar[]; slots: PlannerSlot[]; onSaved: () => void; onError: (e: string) => void }) {
  const [rows, setRows] = useState(pillars);
  useEffect(() => setRows(pillars), [pillars]);
  const total = rows.filter((p) => p.active).reduce((n, p) => n + Number(p.sharePct || 0), 0);

  function edit(id: string, patch: Partial<Pillar>) {
    setRows((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  async function saveAll() {
    try {
      for (const p of rows) await api.savePillar(p.id, p);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  async function addPillar() {
    const id = prompt("New pillar id (letters, digits, dashes), e.g. spanish");
    if (!id) return;
    try {
      await api.savePillar(id, { name: id, subject: id, sharePct: 0, sort: rows.length + 1 });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>
        What a post is about. The share is the target part of the week. Active shares add up to <strong>{total}%</strong>
        {total !== 100 && " (should be 100%)"}. "Owner" = never auto-approved. A new book or language gets a pillar here
        (docs/16 §8).
      </p>
      <table className="insights-table planner-config-table">
        <thead>
          <tr>
            <th>Active</th>
            <th>Colour</th>
            <th>Name</th>
            <th>Subject</th>
            <th>Share %</th>
            <th>Slots</th>
            <th>Owner</th>
            <th>Page</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} title={p.note}>
              <td>
                <input type="checkbox" checked={p.active} onChange={(e) => edit(p.id, { active: e.target.checked })} />
              </td>
              <td>
                <input type="color" value={p.color} onChange={(e) => edit(p.id, { color: e.target.value })} />
              </td>
              <td>
                <input type="text" value={p.name} onChange={(e) => edit(p.id, { name: e.target.value })} />
              </td>
              <td>
                <input type="text" value={p.subject} onChange={(e) => edit(p.id, { subject: e.target.value })} />
              </td>
              <td>
                <input type="number" min={0} max={100} value={p.sharePct} onChange={(e) => edit(p.id, { sharePct: Number(e.target.value) })} />
              </td>
              <td className="nowrap">
                {slots.map((s) => (
                  <label key={s.id} className="planner-check">
                    <input
                      type="checkbox"
                      checked={p.slotIds.includes(s.id)}
                      onChange={(e) => edit(p.id, { slotIds: e.target.checked ? [...p.slotIds, s.id] : p.slotIds.filter((x) => x !== s.id) })}
                    />
                    {s.id}
                  </label>
                ))}
              </td>
              <td>
                <input type="checkbox" checked={p.needsOwner} onChange={(e) => edit(p.id, { needsOwner: e.target.checked })} />
              </td>
              <td>
                <input type="text" value={p.landingPath} onChange={(e) => edit(p.id, { landingPath: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button type="button" onClick={saveAll}>
          Save pillars
        </button>
        <button type="button" className="secondary" onClick={addPillar}>
          + Add pillar
        </button>
      </div>
    </div>
  );
}

function SlotsEditor({ slots, onSaved, onError }: { slots: PlannerSlot[]; onSaved: () => void; onError: (e: string) => void }) {
  const [rows, setRows] = useState(slots);
  useEffect(() => setRows(slots), [slots]);

  function edit(id: string, patch: Partial<PlannerSlot>) {
    setRows((cur) => cur.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function saveAll() {
    try {
      for (const s of rows) await api.saveSlot(s.id, s);
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="card">
      <p className="hint" style={{ marginTop: 0 }}>
        The daily posting slots, Sri Lanka time. No two posts within 60 minutes, nothing after 23:00 (docs/16 §3).
      </p>
      <table className="insights-table planner-config-table">
        <thead>
          <tr>
            <th>Active</th>
            <th>Slot</th>
            <th>Name</th>
            <th>From</th>
            <th>To</th>
            <th>Type</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>
                <input type="checkbox" checked={s.active} onChange={(e) => edit(s.id, { active: e.target.checked })} />
              </td>
              <td>{s.id}</td>
              <td>
                <input type="text" value={s.label} onChange={(e) => edit(s.id, { label: e.target.value })} />
              </td>
              <td>
                <input type="time" value={s.timeFrom} onChange={(e) => edit(s.id, { timeFrom: e.target.value })} />
              </td>
              <td>
                <input type="time" value={s.timeTo} onChange={(e) => edit(s.id, { timeTo: e.target.value })} />
              </td>
              <td>
                <select value={s.kind} onChange={(e) => edit(s.id, { kind: e.target.value as PlannerSlot["kind"] })}>
                  {POST_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <input type="text" value={s.note} onChange={(e) => edit(s.id, { note: e.target.value })} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="button-row">
        <button type="button" onClick={saveAll}>
          Save slots
        </button>
      </div>
    </div>
  );
}
