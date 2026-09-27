export type TriState = "default" | "true" | "false";

/** "default" -> undefined (let Settings/config decide), otherwise the boolean. */
export function triStateValue(v: TriState): boolean | undefined {
  return v === "default" ? undefined : v === "true";
}

/**
 * Per-language narration overrides for a render run - lets a run keep, say,
 * the English voice while dropping the Sinhala one (Azure's Sinhala voices
 * aren't always good enough to post). Only matters when narration is on;
 * "Use Settings default" defers to the Settings page's per-language choice.
 */
export function TtsLanguageSelects({
  english,
  sinhala,
  onEnglish,
  onSinhala,
  disabled,
}: {
  english: TriState;
  sinhala: TriState;
  onEnglish: (v: TriState) => void;
  onSinhala: (v: TriState) => void;
  /** True when narration is explicitly off for this run - the language choice is moot then. */
  disabled?: boolean;
}) {
  return (
    <>
      <div className="field">
        <label>English voice</label>
        <select value={english} onChange={(e) => onEnglish(e.target.value as TriState)} disabled={disabled}>
          <option value="default">Use Settings default</option>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      </div>
      <div className="field">
        <label>Sinhala voice</label>
        <select value={sinhala} onChange={(e) => onSinhala(e.target.value as TriState)} disabled={disabled}>
          <option value="default">Use Settings default</option>
          <option value="true">On</option>
          <option value="false">Off</option>
        </select>
      </div>
    </>
  );
}
