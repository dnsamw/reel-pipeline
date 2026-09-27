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
            <Thumb def={selected} box={56} />
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
              <Thumb def={t} box={72} />
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

/** Fits any aspect ratio (square post, 9:16 story...) inside a box×box square so every option lines up. */
function Thumb({ def, box }: { def: PostTemplateDef; box: number }) {
  const width = Math.round(box * Math.min(1, def.width / def.height));
  return (
    <span className="post-picker-thumb" style={{ width: box, height: box }}>
      <PostPreview def={def} fields={def.defaultFields} lists={def.defaultLists} colors={def.defaultColors} width={width} />
    </span>
  );
}
