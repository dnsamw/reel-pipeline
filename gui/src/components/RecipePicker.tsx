import { useEffect, useRef, useState } from "react";
import type { RecipeRecord } from "../types";

/**
 * Replaces the old raw "Composition: 1|2|3" dropdown - picks a
 * CompositionRecipe (the 3 built-ins, always first, plus any custom ones
 * from the Recipes library) instead of a bare template number. Same
 * click-to-toggle custom-dropdown pattern as TemplatePicker.tsx (a native
 * <select> can't show a "Built-in" badge per option).
 */
export function RecipePicker({
  recipes,
  value,
  onChange,
}: {
  recipes: RecipeRecord[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const sorted = [...recipes].sort((a, b) => (a.builtin === b.builtin ? 0 : a.builtin ? -1 : 1));
  const selected = recipes.find((r) => r.id === value) ?? null;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="template-picker" ref={rootRef}>
      <button type="button" className="template-picker-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <>
            <span className="template-picker-trigger-text">{selected.name}</span>
            {selected.builtin && <span className="badge queued-badge">Built-in</span>}
          </>
        ) : (
          <span className="template-picker-trigger-text hint">Choose a composition...</span>
        )}
        <span className="template-picker-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="template-picker-menu">
          {sorted.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`template-picker-option${r.id === value ? " selected" : ""}`}
              onClick={() => pick(r.id)}
            >
              <span className="template-picker-option-text">
                <strong>
                  {r.name} {r.builtin && <span className="badge queued-badge">Built-in</span>}
                </strong>
                <span className="hint">{r.description || "No description"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
