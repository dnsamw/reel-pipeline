import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Shuffle, Sparkles } from "lucide-react";
import { api } from "../api";
import { ConfirmDialog } from "./ConfirmDialog";
import type { AiStatus, CaptionContext, CaptionMeta, CaptionTone, Publication, PublishPlatform, PublishSource, PublishTargetOption } from "../types";

/** Brand colours for the small platform markers (lucide dropped brand logos). */
export const PLATFORM_COLORS: Record<PublishPlatform, string> = {
  facebook: "#1877f2",
  instagram: "#e1306c",
  youtube: "#ff0033",
  tiktok: "#25f4ee",
};

const PLATFORM_LABELS: Record<PublishPlatform, string> = { facebook: "Facebook", instagram: "Instagram", youtube: "YouTube", tiktok: "TikTok" };

const TONES: { value: CaptionTone; label: string }[] = [
  { value: "friendly", label: "Friendly" },
  { value: "challenge", label: "Challenge" },
  { value: "teacher", label: "Teacher" },
];

export function PlatformDot({ platform }: { platform: PublishPlatform }) {
  return <span className="platform-dot" style={{ background: PLATFORM_COLORS[platform] }} />;
}

/** How a successful publish is shown - a TikTok draft or a private YouTube upload isn't "published". */
const OUTCOME_LABEL: Record<"live" | "draft" | "private" | "unlisted", string> = {
  live: "Published",
  draft: "Sent to drafts",
  private: "Uploaded (private)",
  unlisted: "Uploaded (unlisted)",
};

function sourceId(source: PublishSource): string {
  return source.type === "post" ? `post:${source.savedPath}` : `batch:${source.template}:${source.batchId}`;
}

/** One caption being edited, plus how it was made - `suggested` is the text as it arrived, to tell later whether it was edited by hand. */
interface Draft {
  text: string;
  title?: string;
  meta: CaptionMeta;
  suggested: string | null;
}

function manualDraft(text: string): Draft {
  return { text, meta: { engine: "manual" }, suggested: null };
}

function isUntouched(d: Draft): boolean {
  return d.suggested != null && d.text === d.suggested;
}

/**
 * Publish one file (a Post Creator export or a batch reel) to any mix of
 * connected platforms. Asks the server which platforms can take *this* file
 * (format/length/aspect rules differ per platform), confirms, then starts one
 * background publish per platform and polls each until it lands.
 *
 * The caption starts as a built-in suggestion (no AI needed - see
 * server/captions/builtin.ts); "Write with AI" is an extra when the server
 * has an AI key. How each caption was made is sent along and stored on the
 * publication, so performance can later be compared by engine/tone/hook.
 */
export function PublishPanel({
  source,
  previousCaption,
  fallbackCaption,
  captionContext,
  kind,
  previewUrl,
  stale = false,
}: {
  source: PublishSource;
  /** Caption this file was published with before - kept instead of a fresh suggestion. */
  previousCaption?: string;
  /** Used if the caption suggestion itself fails (e.g. the phrase DB is unreachable). */
  fallbackCaption: string;
  /** What a post contains (batch reels are looked up by the server). */
  captionContext?: CaptionContext;
  kind: "image" | "reel";
  previewUrl: string;
  /** The post was edited after this file was exported - warn that the older export goes out. */
  stale?: boolean;
}) {
  const [targets, setTargets] = useState<PublishTargetOption[] | null>(null);
  const [selected, setSelected] = useState<Set<PublishPlatform>>(new Set());
  const [shared, setShared] = useState<Draft>(() => manualDraft(previousCaption ?? ""));
  const [perPlatform, setPerPlatform] = useState(false);
  const [byPlatform, setByPlatform] = useState<Partial<Record<PublishPlatform, Draft>>>({});
  const [tab, setTab] = useState<PublishPlatform | null>(null);
  const [tone, setTone] = useState<CaptionTone>("friendly");
  const [variant, setVariant] = useState(0);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [suggesting, setSuggesting] = useState<"builtin" | "ai" | null>(null);
  const [captionNote, setCaptionNote] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Private by default: acts as a draft you release from YouTube Studio (and unaudited projects are forced private anyway).
  const [ytPrivacy, setYtPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [jobs, setJobs] = useState<Publication[]>([]);
  const [error, setError] = useState<string | null>(null);
  const key = sourceId(source);
  // Only the latest suggestion request may write its answer (AI can take a minute; the user may shuffle meanwhile).
  const requestSeq = useRef(0);

  useEffect(() => {
    api.aiStatus().then(setAi).catch(() => setAi({ available: false, model: null }));
  }, []);

  // A different file is a fresh publish: reload what it can go to, reset caption and results.
  useEffect(() => {
    let alive = true;
    setTargets(null);
    setJobs([]);
    setError(null);
    setCaptionNote(null);
    setPerPlatform(false);
    setByPlatform({});
    setVariant(0);
    setShared(manualDraft(previousCaption ?? ""));
    api
      .publishTargets(source)
      .then(({ targets }) => {
        if (!alive) return;
        setTargets(targets);
        // Pre-tick every platform that can take this file.
        const ready = targets.filter((t) => !t.unavailableReason).map((t) => t.platform);
        setSelected(new Set(ready));
        setTab(ready[0] ?? null);
        if (!previousCaption) void suggest("builtin", { platforms: ready, perPlatform: false, variant: 0 });
      })
      .catch((err) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const running = jobs.some((j) => j.status === "uploading");

  // Poll running jobs until every platform has finished or failed.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(async () => {
      const next = await Promise.all(jobs.map((j) => (j.status === "uploading" ? api.publication(j.id).catch(() => j) : j)));
      setJobs(next);
    }, 2000);
    return () => clearInterval(t);
  }, [running, jobs]);

  const ready = useMemo(() => (targets ?? []).filter((t) => !t.unavailableReason), [targets]);
  const chosen = ready.filter((t) => selected.has(t.platform));
  const activeTab = perPlatform && tab && chosen.some((t) => t.platform === tab) ? tab : (chosen[0]?.platform ?? null);

  const draftFor = (p: PublishPlatform): Draft => (perPlatform ? (byPlatform[p] ?? shared) : shared);
  const editing: Draft = perPlatform && activeTab ? draftFor(activeTab) : shared;

  function setEditing(patch: Partial<Draft>) {
    if (perPlatform && activeTab) setByPlatform((cur) => ({ ...cur, [activeTab]: { ...draftFor(activeTab), ...patch } }));
    else setShared((d) => ({ ...d, ...patch }));
  }

  function toggle(p: PublishPlatform) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  /**
   * Asks the server for captions. Shared mode gets one caption shaped for the
   * only chosen platform (or Facebook's general shape when several are
   * chosen); per-platform mode gets one per chosen platform.
   */
  async function suggest(
    engine: "builtin" | "ai",
    over: { platforms?: PublishPlatform[]; perPlatform?: boolean; variant?: number; tone?: CaptionTone } = {},
  ) {
    const platforms = over.platforms ?? chosen.map((t) => t.platform);
    const separate = over.perPlatform ?? perPlatform;
    const v = over.variant ?? variant;
    const t = over.tone ?? tone;
    const ask: PublishPlatform[] = separate ? (platforms.length ? platforms : ["facebook"]) : [platforms.length === 1 ? platforms[0] : "facebook"];

    const seq = ++requestSeq.current;
    setSuggesting(engine);
    setCaptionNote(null);
    try {
      const res = await api.suggestCaptions({ source, context: captionContext, platforms: ask, tone: t, variant: v, engine });
      if (seq !== requestSeq.current) return;
      const toDraft = (p: PublishPlatform): Draft | null => {
        const c = res.captions[p];
        if (!c) return null;
        return { text: c.caption, title: c.title, suggested: c.caption, meta: { engine: res.engine, tone: t, hookId: c.hookId } };
      };
      if (separate) {
        setByPlatform((cur) => {
          const next = { ...cur };
          for (const p of ask) next[p] = toDraft(p) ?? next[p];
          return next;
        });
      } else {
        const d = toDraft(ask[0]);
        if (d) setShared(d);
      }
      setCaptionNote(res.fallbackReason ?? null);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setCaptionNote(`Couldn't suggest a caption: ${err instanceof Error ? err.message : String(err)}`);
      if (!separate) setShared((d) => (d.text ? d : manualDraft(fallbackCaption)));
    } finally {
      if (seq === requestSeq.current) setSuggesting(null);
    }
  }

  function onShuffle() {
    const v = variant + 1;
    setVariant(v);
    void suggest("builtin", { variant: v });
  }

  function onTone(t: CaptionTone) {
    setTone(t);
    // Re-suggest only if the current text is still an untouched suggestion - never overwrite hand edits.
    if (isUntouched(editing)) void suggest("builtin", { tone: t });
  }

  function onPerPlatform(on: boolean) {
    setPerPlatform(on);
    if (!on) return;
    // Tailor each platform when the shared caption is still just a suggestion; otherwise start every platform from the hand-edited text.
    if (isUntouched(shared) || !shared.text) void suggest("builtin", { perPlatform: true });
    else setByPlatform(Object.fromEntries(chosen.map((t) => [t.platform, { ...shared }])));
  }

  async function onPublish() {
    setConfirming(false);
    setError(null);
    try {
      setJobs(
        await api.distribute(
          source,
          chosen.map((t) => {
            const d = draftFor(t.platform);
            const meta: CaptionMeta = d.meta.engine === "manual" ? d.meta : { ...d.meta, edited: d.text !== d.suggested };
            return { platform: t.platform, caption: d.text, title: d.title, privacy: t.platform === "youtube" ? ytPrivacy : undefined, captionMeta: meta };
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const done = jobs.length > 0 && !running;
  const busy = suggesting != null || running;
  const aiTitle = !ai?.available
    ? "Add NVIDIA_API_KEY to .env and restart the server to enable AI captions"
    : `Writes a fresh caption with ${ai.model} - can take up to a minute`;

  return (
    <div className="publish-panel">
      <ConfirmDialog
        open={confirming}
        title={`Publish to ${chosen.length === 1 ? chosen[0].label : `${chosen.length} platforms`}?`}
        confirmLabel="Publish"
        onConfirm={onPublish}
        onCancel={() => setConfirming(false)}
      >
        <div className="publish-confirm">
          {kind === "image" ? <img src={previewUrl} alt="" /> : <video src={previewUrl} muted playsInline />}
          <div className="publish-confirm-info">
            <p>It will be posted to:</p>
            <ul className="publish-confirm-platforms">
              {chosen.map((t) => (
                <li key={t.platform}>
                  <PlatformDot platform={t.platform} /> <strong>{t.label}</strong> {t.accountName && <span className="hint">{t.accountName}</span>}
                  {t.platform === "youtube" && <span className="hint"> · {ytPrivacy}</span>}
                  {t.platform === "tiktok" && <span className="hint"> · to your drafts</span>}
                </li>
              ))}
            </ul>
            {perPlatform ? (
              <p className="hint">Each platform gets its own caption.</p>
            ) : shared.text.trim() ? (
              <p className="publish-confirm-caption">{shared.text}</p>
            ) : (
              <p className="hint">No caption.</p>
            )}
            {stale && <p className="hint post-publish-stale">You've edited the post since this export. This publishes the older export.</p>}
          </div>
        </div>
      </ConfirmDialog>

      <div className="field">
        <label>Publish to</label>
        {!targets && !error && <span className="hint">Checking platforms…</span>}
        <div className="publish-targets">
          {(targets ?? []).map((t) => {
            const disabled = !!t.unavailableReason || running;
            return (
              <label key={t.platform} className={`publish-target${t.unavailableReason ? " unavailable" : ""}`} title={t.unavailableReason ?? undefined}>
                <input type="checkbox" checked={!t.unavailableReason && selected.has(t.platform)} disabled={disabled} onChange={() => toggle(t.platform)} />
                <PlatformDot platform={t.platform} />
                <span className="publish-target-text">
                  <strong>{t.label}</strong>
                  <span className="hint">
                    {t.unavailableReason ? (
                      t.unavailableReason.startsWith("Not connected") ? (
                        <>
                          Not connected - <Link to="/settings">connect in Settings</Link>
                        </>
                      ) : (
                        t.unavailableReason
                      )
                    ) : (
                      t.accountName
                    )}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <div className="field caption-field">
        <div className="caption-head">
          <label>Caption</label>
          {editing.meta.engine !== "manual" && (
            <span className={`badge caption-engine ${editing.meta.engine}`}>{editing.meta.engine === "ai" ? "AI" : "Built-in"}</span>
          )}
          {editing.suggested != null && editing.text !== editing.suggested && <span className="hint caption-edited">edited</span>}
        </div>

        <div className="caption-tools">
          <select value={tone} onChange={(e) => onTone(e.target.value as CaptionTone)} disabled={busy} aria-label="Caption tone">
            {TONES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label} tone
              </option>
            ))}
          </select>
          <button type="button" className="secondary small" onClick={onShuffle} disabled={busy} title="Another built-in suggestion (no AI)">
            <Shuffle size={13} /> {suggesting === "builtin" ? "Suggesting…" : "Shuffle"}
          </button>
          <button type="button" className="secondary small" onClick={() => void suggest("ai")} disabled={busy || !ai?.available} title={aiTitle}>
            <Sparkles size={13} /> {suggesting === "ai" ? "Asking AI… (up to a minute)" : "Write with AI"}
          </button>
          {chosen.length > 1 && (
            <label className="caption-per-platform">
              <input type="checkbox" checked={perPlatform} onChange={(e) => onPerPlatform(e.target.checked)} disabled={busy} />
              Separate caption per platform
            </label>
          )}
        </div>

        {perPlatform && chosen.length > 1 && (
          <div className="segmented caption-tabs">
            {chosen.map((t) => (
              <button key={t.platform} type="button" className={activeTab === t.platform ? "active" : ""} onClick={() => setTab(t.platform)}>
                <PlatformDot platform={t.platform} /> {PLATFORM_LABELS[t.platform]}
              </button>
            ))}
          </div>
        )}

        {activeTab === "youtube" && (perPlatform || chosen.length === 1) && (
          <input
            type="text"
            className="caption-title"
            placeholder="YouTube title"
            maxLength={100}
            value={editing.title ?? ""}
            onChange={(e) => setEditing({ title: e.target.value })}
            disabled={running}
          />
        )}
        {chosen.some((t) => t.platform === "youtube") && (
          <label className="caption-yt-privacy">
            YouTube visibility
            <select value={ytPrivacy} onChange={(e) => setYtPrivacy(e.target.value as typeof ytPrivacy)} disabled={running}>
              <option value="private">Private (release later in YouTube Studio)</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
        )}
        <textarea rows={7} value={editing.text} onChange={(e) => setEditing({ text: e.target.value })} disabled={running || suggesting === "ai"} />
        <span className="hint caption-count">{editing.text.length} characters</span>
        {captionNote && <p className="hint caption-note">{captionNote}</p>}
      </div>
      {stale && jobs.length === 0 && <p className="hint post-publish-stale">You've edited the post since this export. Export again to publish the latest version.</p>}
      {error && <div className="error-banner">{error}</div>}

      {jobs.length > 0 && (
        <ul className="publish-jobs">
          {jobs.map((j) => {
            const label = targets?.find((t) => t.platform === j.platform)?.label ?? j.platform;
            return (
              <li key={j.id}>
                <PlatformDot platform={j.platform} />
                <strong>{label}</strong>
                {j.status === "uploading" && <span className="badge running">{j.stage ?? "Publishing…"}</span>}
                {j.status === "published" && <span className="badge done">{OUTCOME_LABEL[j.outcome ?? "live"]}</span>}
                {j.status === "error" && <span className="badge error">Failed</span>}
                {j.status === "published" && j.fbPermalink && (
                  <a href={j.fbPermalink} target="_blank" rel="noreferrer" className="publish-job-link">
                    View <ExternalLink size={12} />
                  </a>
                )}
                {j.status === "error" && j.error && <span className="publish-job-error">{j.error}</span>}
                {j.platform === "tiktok" && j.status === "published" && j.outcome === "draft" && (
                  <span className="publish-job-note">
                    Open TikTok → Inbox to finish and post it. TikTok drafts don't carry the caption:{" "}
                    <button type="button" className="secondary small" onClick={() => void navigator.clipboard.writeText(j.caption)}>
                      Copy caption
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="button-row" style={{ marginTop: 10 }}>
        <button type="button" onClick={() => setConfirming(true)} disabled={busy || chosen.length === 0}>
          {running ? "Publishing…" : done ? "Publish again" : chosen.length > 1 ? `Publish to ${chosen.length} platforms` : chosen.length === 1 ? `Publish to ${chosen[0].label}` : "Publish"}
        </button>
      </div>
    </div>
  );
}
