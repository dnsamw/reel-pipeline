import type { Phrase } from "../types";

export type PhraseEdit = Pick<Phrase, "phrase" | "translationSi" | "pronunciationSi" | "explanation" | "explanationSi">;

export function toPhraseEdit(p: Phrase): PhraseEdit {
  return {
    phrase: p.phrase,
    translationSi: p.translationSi,
    pronunciationSi: p.pronunciationSi,
    explanation: p.explanation,
    explanationSi: p.explanationSi,
  };
}

// Shared by the Queue's per-reel accordion and the Render Queue's pre-render
// edit panel, so a correction typed in either place uses the same fields.
export function PhraseEditFields({
  edit,
  onChange,
  label,
}: {
  edit: PhraseEdit;
  onChange: (edit: PhraseEdit) => void;
  label?: string;
}) {
  return (
    <div className="queue-phrase-card">
      {label && (
        <div className="hint" style={{ marginBottom: 6 }}>
          {label}
        </div>
      )}
      <div className="grid">
        <div className="field">
          <label>English phrase</label>
          <input type="text" value={edit.phrase} onChange={(e) => onChange({ ...edit, phrase: e.target.value })} />
        </div>
        <div className="field">
          <label>Pronunciation (Sinhala script)</label>
          <input
            type="text"
            value={edit.pronunciationSi ?? ""}
            onChange={(e) => onChange({ ...edit, pronunciationSi: e.target.value || null })}
          />
        </div>
        <div className="field">
          <label>Sinhala meaning</label>
          <input
            type="text"
            value={edit.translationSi ?? ""}
            onChange={(e) => onChange({ ...edit, translationSi: e.target.value || null })}
          />
        </div>
      </div>
      <div className="grid" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Explanation (English)</label>
          <textarea rows={2} value={edit.explanation} onChange={(e) => onChange({ ...edit, explanation: e.target.value })} />
        </div>
        <div className="field">
          <label>Explanation (Sinhala)</label>
          <textarea
            rows={2}
            value={edit.explanationSi ?? ""}
            onChange={(e) => onChange({ ...edit, explanationSi: e.target.value || null })}
          />
        </div>
      </div>
    </div>
  );
}
