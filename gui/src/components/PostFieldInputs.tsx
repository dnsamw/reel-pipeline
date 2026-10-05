import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { api } from "../api";
import type {
  PostListFieldDef,
  PostListItem,
  PostScalarFieldDef,
} from "../../../src/posts/types";

// Content-form inputs generated from a template's field defs - shared by
// Post Creator and Ad Creator.

export function PostFieldInput({
  def,
  value,
  onChange,
  onError,
  placeholder,
}: {
  def: PostScalarFieldDef;
  value: string;
  onChange: (value: string) => void;
  onError: (message: string) => void;
  /** Shown while empty - e.g. the value an ad template falls back to. */
  placeholder?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { path } = await api.uploadImage(file);
      onChange(path);
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>{def.label}</label>
      {def.type === "textarea" && (
        <textarea
          rows={2}
          lang={def.lang}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {def.type === "text" && (
        <input
          type="text"
          lang={def.lang}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {def.type === "range" && (
        <div className="post-range-field">
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            type="number"
            className="post-range-number"
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          {def.unit && <span className="post-range-unit">{def.unit}</span>}
        </div>
      )}
      {def.type === "image" && (
        <div className="post-image-field">
          <input
            type="text"
            value={value}
            placeholder={placeholder ?? "images/… path or https:// URL"}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="secondary"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
          {value && (
            <button
              type="button"
              className="secondary"
              onClick={() => onChange("")}
            >
              Clear
            </button>
          )}
        </div>
      )}
      {def.hint && <span className="hint">{def.hint}</span>}
    </div>
  );
}

/** Editor for a "list" field: one card per item (its sub-fields), with reorder/remove and an add button. */
export function PostListInput({
  def,
  items,
  onChange,
}: {
  def: PostListFieldDef;
  items: PostListItem[];
  onChange: (items: PostListItem[]) => void;
}) {
  const min = def.minItems ?? 0;
  const max = def.maxItems ?? Infinity;

  function update(index: number, key: string, value: string) {
    onChange(
      items.map((it, i) => (i === index ? { ...it, [key]: value } : it)),
    );
  }

  function move(index: number, delta: number) {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved);
    onChange(next);
  }

  function add() {
    onChange([
      ...items,
      Object.fromEntries(def.itemFields.map((f) => [f.key, ""])),
    ]);
  }

  return (
    <div className="field" style={{ gridColumn: "1 / -1" }}>
      <label>
        {def.label} ({items.length})
      </label>
      <div className="post-list-items">
        {items.map((item, i) => (
          <div className="post-list-item" key={i}>
            <div className="post-list-item-header">
              <span className="post-list-item-num">{i + 1}</span>
              <span className="post-list-item-title">
                {item[def.itemFields[0].key] || `${def.itemLabel} ${i + 1}`}
              </span>
              {!def.fixed && (
                <>
                  <button
                    type="button"
                    className="icon-button"
                    title="Move up"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    title="Move down"
                    disabled={i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown size={14} />
                  </button>
                  <button
                    type="button"
                    className="icon-button danger"
                    title={`Remove ${def.itemLabel.toLowerCase()}`}
                    disabled={items.length <= min}
                    onClick={() => onChange(items.filter((_, j) => j !== i))}
                  >
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
            <div className="post-list-item-fields">
              {def.itemFields.map((f) => (
                <div className="field" key={f.key}>
                  <label>{f.label}</label>
                  {f.type === "textarea" ? (
                    <textarea
                      rows={2}
                      lang={f.lang}
                      value={item[f.key] ?? ""}
                      onChange={(e) => update(i, f.key, e.target.value)}
                    />
                  ) : (
                    <input
                      type="text"
                      lang={f.lang}
                      value={item[f.key] ?? ""}
                      onChange={(e) => update(i, f.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {!def.fixed && (
        <div>
          <button
            type="button"
            className="secondary small post-list-add"
            disabled={items.length >= max}
            onClick={add}
          >
            <Plus size={14} /> Add {def.itemLabel.toLowerCase()}
          </button>
        </div>
      )}
      {def.hint && <span className="hint">{def.hint}</span>}
    </div>
  );
}
