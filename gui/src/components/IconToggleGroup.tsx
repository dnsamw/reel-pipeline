import type { ReactNode } from "react";

/**
 * A row of icon (or short-label) buttons, one active at a time, each with a
 * tooltip - the compact replacement for a labeled <select> on enum fields
 * (align, font, shape, color/text source, animation type). See
 * docs/COMPOSITION_DESIGNER.md's graph-centric editing round.
 */
export function IconToggleGroup<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="icon-toggle-group">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`icon-toggle${opt.value === value ? " active" : ""}`}
          title={opt.label}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}
