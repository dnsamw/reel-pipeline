import { useEffect, useRef, useState } from "react";
import { PostPreview } from "./PostPreview";
import type { PostTemplateDef } from "../../../src/posts/types";
import { shouldOpenUp } from "../lib/dropdownDirection";

/**
 * Same custom-dropdown pattern (and CSS) as TemplatePicker.tsx, but each
 * option's thumbnail is a small live render of the post template with its
 * default content rather than static color swatches.
 */
export function PostTemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: PostTemplateDef[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const selected = templates.find((t) => t.id === value) ?? null;

  function toggle() {
    if (!open) setOpenUp(shouldOpenUp(rootRef.current));
    setOpen(!open);
  }

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  return (
    <div className="template-picker" ref={rootRef}>
      <button type="button" className="template-picker-trigger" onClick={toggle}>
        {selected ? (
          <>
            <PostPreview def={selected} fields={selected.defaultFields} colors={selected.defaultColors} width={56} />
            <span className="template-picker-trigger-text">{selected.name}</span>
          </>
        ) : (
          <span className="template-picker-trigger-text hint">Pick a post template</span>
        )}
        <span className="template-picker-caret">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className={`template-picker-menu${openUp ? " up" : ""}`}>
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`template-picker-option${t.id === value ? " selected" : ""}`}
              onClick={() => pick(t.id)}
            >
              <PostPreview def={t} fields={t.defaultFields} colors={t.defaultColors} width={72} />
              <span className="template-picker-option-text">
                <strong>{t.name}</strong>
                <span className="hint">{t.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
