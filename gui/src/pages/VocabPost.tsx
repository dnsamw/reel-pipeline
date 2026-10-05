import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../api";
import { PostCreator, type Draft } from "./PostCreator";
import { vocabPostTemplates } from "../../../src/posts/registry";

/**
 * Vocabulary table posts (title, subtitle, word | pronunciation | meaning
 * rows, StudyPal logo) - the Post Creator page locked to the vocab templates,
 * one shared draft across both sizes, plus an AI word generator.
 */
export function VocabPost() {
  return (
    <PostCreator
      title="Vocab Post"
      templates={vocabPostTemplates}
      storagePrefix="studypal-reels:vocab-post"
      templateHeading="Size"
      sharedDraft
      contentExtras={(draft, setDraft, onError) => <AiGenerate draft={draft} setDraft={setDraft} onError={onError} />}
    />
  );
}

function AiGenerate({
  draft,
  setDraft,
  onError,
}: {
  draft: Draft;
  setDraft: (update: (d: Draft) => Draft) => void;
  onError: (message: string | null) => void;
}) {
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null);
  const [count, setCount] = useState(8);
  const [busy, setBusy] = useState<"replace" | "append" | null>(null);

  useEffect(() => {
    api.aiStatus().then((s) => setAiAvailable(s.available)).catch(() => setAiAvailable(false));
  }, []);

  const topic = draft.fields.title?.trim() ?? "";
  const existing = (draft.lists.items ?? []).filter((it) => it.word?.trim());

  async function generate(mode: "replace" | "append") {
    onError(null);
    setBusy(mode);
    try {
      const { subtitle, items } = await api.generateVocab({ topic, count, avoid: mode === "append" ? existing.map((it) => it.word) : [] });
      setDraft((d) => ({
        ...d,
        // A fresh generate is a new topic, so its Sinhala subtitle replaces the old one; Add more keeps it.
        fields: mode === "replace" && subtitle ? { ...d.fields, subtitle } : d.fields,
        lists: { ...d.lists, items: mode === "append" ? [...(d.lists.items ?? []).filter((it) => it.word?.trim()), ...items] : items },
      }));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="vocab-ai">
      <div className="vocab-ai-row">
        <label htmlFor="vocab-ai-count">Words</label>
        <input id="vocab-ai-count" type="number" min={1} max={20} value={count} onChange={(e) => setCount(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} />
        <button type="button" disabled={!aiAvailable || !topic || !!busy} onClick={() => generate("replace")}>
          <Sparkles size={14} /> {busy === "replace" ? "Generating…" : "Generate from title"}
        </button>
        <button type="button" className="secondary" disabled={!aiAvailable || !topic || !!busy || existing.length === 0} onClick={() => generate("append")}>
          {busy === "append" ? "Adding…" : "Add more"}
        </button>
      </div>
      <span className="hint">
        {aiAvailable === false
          ? "AI isn't configured - add NVIDIA_API_KEY to .env to generate words."
          : "Fills the rows from the title. Generate replaces them, Add more adds new words below. Check the Sinhala before exporting. The free AI tier can take up to a minute."}
      </span>
    </div>
  );
}
