import type { Palette, ReelConfig } from "../types";

// Shared by the Template Editor (per-template overrides) and the Settings
// page (the GUI-wide baseline, same shape - see server/settings.ts) so the
// two don't drift apart.
export const NUMBER_FIELDS: { key: keyof ReelConfig; label: string; step?: number; min?: number; max?: number }[] = [
  { key: "phrasesPerReel", label: "Phrases per reel", step: 1, min: 1, max: 6 },
  { key: "introSeconds", label: "Intro seconds", step: 0.5, min: 0, max: 10 },
  { key: "phraseSeconds", label: "Phrase seconds", step: 0.5, min: 0.5, max: 12 },
  { key: "countdownSeconds", label: "Countdown seconds", step: 1, min: 1, max: 15 },
  { key: "revealSeconds", label: "Reveal seconds", step: 0.5, min: 0.5, max: 12 },
  { key: "outroSeconds", label: "Outro seconds", step: 0.5, min: 0.5, max: 10 },
  { key: "transitionSeconds", label: "Transition seconds", step: 0.1, min: 0, max: 3 },
  { key: "ttsRate", label: "TTS speed (1 = normal)", step: 0.05, min: 0.5, max: 2 },
  { key: "musicVolume", label: "Music volume", step: 0.05, min: 0, max: 1 },
  { key: "tickVolume", label: "Tick volume", step: 0.05, min: 0, max: 1 },
  { key: "revealSoundVolume", label: "Reveal sound volume", step: 0.05, min: 0, max: 1 },
  { key: "introVoiceVolume", label: "Intro voice volume", step: 0.05, min: 0, max: 1 },
  { key: "phraseVoiceVolume", label: "Phrase voice volume", step: 0.05, min: 0, max: 1 },
  { key: "revealVoiceVolume", label: "Reveal voice volume", step: 0.05, min: 0, max: 1 },
];

export const PALETTE_FIELDS: { key: keyof Palette; label: string }[] = [
  { key: "primary", label: "Primary" },
  { key: "brand2", label: "Brand 2" },
  { key: "gold", label: "Gold" },
  { key: "goldInk", label: "Gold ink (text on gold)" },
  { key: "foreground", label: "Foreground (text)" },
  { key: "mutedForeground", label: "Muted text" },
  { key: "border", label: "Border" },
  { key: "background", label: "Background" },
];

function isValidHex(v: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(v);
}

// A real <input type="text"> is the primary control here, not <input
// type="color"> - typing into that native color swatch's hex sub-field
// works, but pasting into it doesn't reliably register in Chromium (the
// paste event isn't forwarded to that shadow-DOM field the way it is for a
// normal text input). The swatch stays as a secondary visual-picker button.
export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="color-input-row">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#58238b"
          spellCheck={false}
          className="color-hex-input"
        />
        <input
          type="color"
          value={isValidHex(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          title="Pick visually"
          className="color-swatch-input"
        />
      </div>
    </div>
  );
}

export function ReelConfigNumberFields({
  config,
  onChange,
}: {
  config: Partial<ReelConfig>;
  onChange: <K extends keyof ReelConfig>(key: K, value: ReelConfig[K]) => void;
}) {
  return (
    <div className="grid">
      {NUMBER_FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label>{f.label}</label>
          <input
            type="number"
            step={f.step}
            min={f.min}
            max={f.max}
            value={(config[f.key] as number | undefined) ?? ""}
            onChange={(e) => onChange(f.key, (e.target.value === "" ? undefined : Number(e.target.value)) as never)}
          />
        </div>
      ))}
    </div>
  );
}

export function ReelConfigPaletteFields({
  variant,
  palette,
  onChange,
}: {
  variant: "light" | "dark";
  palette: Palette;
  onChange: (key: keyof Palette, value: string) => void;
}) {
  return (
    <div className="grid">
      {PALETTE_FIELDS.map((f) => (
        <ColorField key={`${variant}-${f.key}`} label={f.label} value={palette[f.key]} onChange={(v) => onChange(f.key, v)} />
      ))}
    </div>
  );
}
