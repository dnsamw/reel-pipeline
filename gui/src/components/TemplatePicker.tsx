import { useEffect, useRef, useState } from "react";
import { ThemePreviewPair } from "./ThemeThumbnail";
import type { ReelTheme, TemplateRecord } from "../types";

/**
 * A native <select> can't render anything but plain text inside <option> -
 * showing a color thumbnail per template needs a custom dropdown instead.
 * Kept intentionally simple (click-to-toggle, click-outside-to-close) rather
 * than a full combobox with keyboard navigation, matching the scope of what
 * this picker needs to do.
 */
export function TemplatePicker({
  templates,
  value,
  onChange,
  defaultTheme,
}: {
  templates: TemplateRecord[];
  value: string;
  onChange: (id: string) => void;
  defaultTheme: ReelTheme | null;
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

  const selected = templates.find((t) => t.id === value) ?? null;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="template-picker" ref={rootRef}>
      <button type="button" className="template-picker-trigger" onClick={() => setOpen((o) => !o)}>
        {selected ? (
          <>
            {(selected.config.theme ?? defaultTheme) && <ThemePreviewPair theme={selected.config.theme ?? defaultTheme!} />}
            <span className="template-picker-trigger-text">{selected.name}</span>
          </>
        ) : (
          <span className="template-picker-trigger-text hint">None - use defaultConfig</span>
        )}
        <span className="template-picker-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="template-picker-menu">
          <button type="button" className="template-picker-option" onClick={() => pick("")}>
            <span className="template-picker-option-text hint">None - use defaultConfig</span>
          </button>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`template-picker-option${t.id === value ? " selected" : ""}`}
              onClick={() => pick(t.id)}
            >
              {(t.config.theme ?? defaultTheme) && <ThemePreviewPair theme={t.config.theme ?? defaultTheme!} />}
              <span className="template-picker-option-text">
                <strong>{t.name}</strong>
                <span className="hint">{t.description || "No description"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
