import { useEffect, useRef, useState } from "react";
import { AdPreview } from "./AdPreview";
import { DEFAULT_MOCKUP_ADJUST, type AdTemplateDef } from "../../../src/ads/types";
import { shouldOpenUp } from "../lib/dropdownDirection";

/**
 * Same dropdown pattern (and CSS) as PostTemplatePicker.tsx - each option's
 * thumbnail is a live render of the ad template's default content (PT).
 */
export function AdTemplatePicker({ templates, value, onChange }: { templates: AdTemplateDef[]; value: string; onChange: (id: string) => void }) {
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

  return (
    <div className="template-picker" ref={rootRef}>
      <button type="button" className="template-picker-trigger" onClick={toggle}>
        {selected ? (
          <>
            <Thumb def={selected} box={56} />
            <span className="template-picker-trigger-text">{selected.name}</span>
          </>
        ) : (
          <span className="template-picker-trigger-text hint">Pick an ad template</span>
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
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <Thumb def={t} box={72} />
              <span className="template-picker-option-text">
                <strong>{t.name}</strong>
                <span className="hint">
                  {t.funnel} · {t.description}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A 4:5 thumbnail centred in a box×box square. */
function Thumb({ def, box }: { def: AdTemplateDef; box: number }) {
  return (
    <span className="post-picker-thumb" style={{ width: box, height: box }}>
      <AdPreview
        def={def}
        width={Math.round((box * 1080) / 1350)}
        format="PT"
        product={def.defaultProduct}
        fields={def.defaultFields}
        lists={def.defaultLists ?? {}}
        colors={{}}
        mockup={DEFAULT_MOCKUP_ADJUST}
      />
    </span>
  );
}
