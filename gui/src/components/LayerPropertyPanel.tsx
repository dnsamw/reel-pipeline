import { useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Ban,
  Circle,
  Contrast,
  Droplet,
  FileText,
  Image as ImageIcon,
  Link2,
  Minus,
  MoveDown,
  MoveLeft,
  MoveRight,
  MoveUp,
  Palette,
  PenLine,
  RectangleHorizontal,
  Sparkles,
  Square,
  Star,
  TextCursor,
  Trash2,
  Triangle,
  Type,
  Zap,
} from "lucide-react";
import { api } from "../api";
import { Knob } from "./Knob";
import { IconToggleGroup } from "./IconToggleGroup";
import { contentForKind } from "../lib/layerDefaults";
import type { AnimationStep, ColorRef, DataSourceField, Layer, Palette as PaletteType, ShapeLayer, TextRef } from "../types";

/**
 * The property panel that opens beside the Graph canvas when a layer node
 * is selected - everything for that layer EXCEPT position/size/rotation
 * (those stay on LayerCanvas.tsx's direct-manipulation canvas). Knobs for
 * numeric fields, icon-toggle groups for enum fields, instead of labeled
 * <select>/<input> rows - see docs/COMPOSITION_DESIGNER.md.
 */

const THEME_TOKENS: (keyof PaletteType)[] = ["primary", "brand2", "gold", "goldInk", "foreground", "mutedForeground", "border", "background"];
const OPPOSITE_TOKENS: ("primary" | "brand2" | "gold")[] = ["primary", "brand2", "gold"];

function ColorControl({ label, value, onChange, onClear }: { label: string; value: ColorRef | undefined; onChange: (v: ColorRef) => void; onClear?: () => void }) {
  const v = value ?? { source: "theme" as const, token: "foreground" as const };
  return (
    <div className="node-property-row">
      <IconToggleGroup
        value={v.source}
        onChange={(source) => {
          if (source === "literal") onChange({ source, hex: "#000000" });
          else if (source === "theme") onChange({ source, token: "foreground" });
          else onChange({ source, token: "primary" });
        }}
        options={[
          { value: "literal", label: `${label}: literal color`, icon: <Droplet size={14} /> },
          { value: "theme", label: `${label}: this beat's theme`, icon: <Palette size={14} /> },
          { value: "oppositeThemeToken", label: `${label}: opposite theme (contrast)`, icon: <Contrast size={14} /> },
        ]}
      />
      {v.source === "literal" && <input type="color" value={v.hex} onChange={(e) => onChange({ source: "literal", hex: e.target.value })} title={label} style={{ width: 28, height: 28, padding: 0 }} />}
      {v.source === "theme" && (
        <select value={v.token} onChange={(e) => onChange({ source: "theme", token: e.target.value as keyof PaletteType })} title={label} style={{ width: 90 }}>
          {THEME_TOKENS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {v.source === "oppositeThemeToken" && (
        <select value={v.token} onChange={(e) => onChange({ source: "oppositeThemeToken", token: e.target.value as "primary" | "brand2" | "gold" })} title={label} style={{ width: 90 }}>
          {OPPOSITE_TOKENS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {onClear && (
        <button type="button" className="secondary" title={`Clear ${label}`} onClick={onClear} style={{ padding: "2px 6px" }}>
          <Ban size={12} />
        </button>
      )}
    </div>
  );
}

function AnimationControl({ label, step, onChange, allowTypewriter }: { label: string; step: AnimationStep; onChange: (s: AnimationStep) => void; allowTypewriter?: boolean }) {
  const options: { value: AnimationStep["type"]; label: string; icon: React.ReactNode }[] = [
    { value: "none", label: `${label}: none`, icon: <Ban size={14} /> },
    { value: "fade", label: `${label}: fade`, icon: <Zap size={14} /> },
    { value: "slide", label: `${label}: slide`, icon: <MoveRight size={14} /> },
    { value: "scaleSpring", label: `${label}: scale (spring)`, icon: <Sparkles size={14} /> },
  ];
  if (allowTypewriter) options.push({ value: "typewriter", label: `${label}: typewriter`, icon: <TextCursor size={14} /> });

  return (
    <div>
      <div className="node-property-row">
        <IconToggleGroup
          value={step.type}
          onChange={(type) => {
            if (type === "none") onChange({ type });
            else if (type === "fade") onChange({ type, durationInFrames: 15 });
            else if (type === "slide") onChange({ type, from: "bottom", durationInFrames: 20 });
            else if (type === "scaleSpring") onChange({ type, fromScale: 0.8 });
            else onChange({ type, durationInFrames: 30 });
          }}
          options={options}
        />
        {(step.type === "fade" || step.type === "slide" || step.type === "typewriter") && (
          <Knob label="frames" value={step.durationInFrames} min={1} max={90} onChange={(v) => onChange({ ...step, durationInFrames: Math.round(v) })} />
        )}
        {step.type === "scaleSpring" && <Knob label="from" value={step.fromScale} min={0} max={1} step={0.05} sensitivity={0.3} format={(v) => v.toFixed(2)} onChange={(v) => onChange({ ...step, fromScale: v })} />}
      </div>
      {step.type === "slide" && (
        <IconToggleGroup
          value={step.from}
          onChange={(from) => onChange({ ...step, from })}
          options={[
            { value: "top", label: "From top", icon: <MoveDown size={14} /> },
            { value: "bottom", label: "From bottom", icon: <MoveUp size={14} /> },
            { value: "left", label: "From left", icon: <MoveRight size={14} /> },
            { value: "right", label: "From right", icon: <MoveLeft size={14} /> },
          ]}
        />
      )}
    </div>
  );
}

export function LayerPropertyPanel({
  layer,
  dataFields,
  fps,
  onChange,
  onDelete,
}: {
  layer: Layer;
  dataFields: DataSourceField[];
  fps: number;
  onChange: (l: Layer) => void;
  onDelete: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function onPickImageFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const { path } = await api.uploadImage(file);
      onChange({ ...layer, src: { source: "asset", path } } as Layer);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="node-property-panel">
      <div className="node-property-row">
        <IconToggleGroup
          value={layer.kind}
          onChange={(kind) => onChange(contentForKind(kind, layer.box, layer.animation, layer.id))}
          options={[
            { value: "text", label: "Text layer", icon: <Type size={14} /> },
            { value: "shape", label: "Shape layer", icon: <Square size={14} /> },
            { value: "image", label: "Image layer", icon: <ImageIcon size={14} /> },
          ]}
        />
        <button type="button" className="danger" title="Delete this layer" onClick={onDelete} style={{ padding: "5px 8px" }}>
          <Trash2 size={14} />
        </button>
      </div>

      {layer.kind === "text" && (
        <>
          <div className="node-property-row">
            <IconToggleGroup
              value={layer.text.source}
              onChange={(source) => {
                const text: TextRef = source === "literal" ? { source, value: "" } : source === "config" ? { source, path: "introText" } : { source, field: dataFields[0]?.key ?? "" };
                onChange({ ...layer, text });
              }}
              options={[
                { value: "literal", label: "Fixed text", icon: <PenLine size={14} /> },
                { value: "dataField", label: "From the data source", icon: <Link2 size={14} /> },
                { value: "config", label: "Global intro text", icon: <FileText size={14} /> },
              ]}
            />
          </div>
          {layer.text.source === "literal" && (
            <input type="text" placeholder="Text..." value={layer.text.value} onChange={(e) => onChange({ ...layer, text: { source: "literal", value: e.target.value } })} />
          )}
          {layer.text.source === "dataField" && (
            <select value={layer.text.field} onChange={(e) => onChange({ ...layer, text: { source: "dataField", field: e.target.value } })}>
              {dataFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          )}

          <div className="node-property-row">
            <IconToggleGroup
              value={layer.font}
              onChange={(font) => onChange({ ...layer, font })}
              options={[
                { value: "sans", label: "Sans (English)", icon: <span>Aa</span> },
                { value: "sinhala", label: "Sinhala", icon: <span>සි</span> },
              ]}
            />
            <IconToggleGroup
              value={layer.align}
              onChange={(align) => onChange({ ...layer, align })}
              options={[
                { value: "left", label: "Align left", icon: <AlignLeft size={14} /> },
                { value: "center", label: "Align center", icon: <AlignCenter size={14} /> },
                { value: "right", label: "Align right", icon: <AlignRight size={14} /> },
              ]}
            />
          </div>
          <div className="node-property-row">
            <Knob label="size" value={layer.fontSizePx} min={12} max={140} onChange={(v) => onChange({ ...layer, fontSizePx: Math.round(v) })} />
            <Knob label="weight" value={layer.fontWeight} min={300} max={900} step={100} onChange={(v) => onChange({ ...layer, fontWeight: Math.round(v) })} />
          </div>
          <ColorControl label="Color" value={layer.color} onChange={(color) => onChange({ ...layer, color })} />
        </>
      )}

      {layer.kind === "shape" && (
        <>
          <IconToggleGroup
            value={layer.shape}
            onChange={(shape) => onChange({ ...layer, shape: shape as ShapeLayer["shape"] })}
            options={[
              { value: "rect", label: "Rectangle", icon: <RectangleHorizontal size={14} /> },
              { value: "circle", label: "Circle", icon: <Circle size={14} /> },
              { value: "ring", label: "Ring (progress)", icon: <Circle size={14} strokeDasharray="3 2" /> },
              { value: "triangle", label: "Triangle", icon: <Triangle size={14} /> },
              { value: "star", label: "Star", icon: <Star size={14} /> },
              { value: "line", label: "Line", icon: <Minus size={14} /> },
            ]}
          />
          <ColorControl label="Fill" value={layer.fill} onChange={(fill) => onChange({ ...layer, fill })} onClear={() => onChange({ ...layer, fill: undefined })} />
          {(layer.shape === "rect" || layer.shape === "ring" || layer.shape === "triangle" || layer.shape === "star" || layer.shape === "line") && (
            <div className="node-property-row">
              {layer.shape === "rect" && <Knob label="radius" value={layer.cornerRadiusPx ?? 0} min={0} max={80} onChange={(v) => onChange({ ...layer, cornerRadiusPx: Math.round(v) })} />}
              <Knob label="stroke" value={layer.strokeWidthPx ?? 0} min={0} max={40} onChange={(v) => onChange({ ...layer, strokeWidthPx: Math.round(v) })} />
            </div>
          )}
          {layer.shape === "ring" && (
            <label className="node-property-row" style={{ cursor: "pointer" }} title="Fill fraction tracks this layer's own timeline window">
              <input type="checkbox" checked={!!layer.progress} onChange={(e) => onChange({ ...layer, progress: e.target.checked ? { source: "countdownProgress" } : undefined })} />
              <span style={{ fontSize: 11 }}>progress</span>
            </label>
          )}
        </>
      )}

      {layer.kind === "image" && (
        <>
          <IconToggleGroup
            value={layer.src.source}
            onChange={(source) => onChange({ ...layer, src: source === "asset" ? { source, path: "" } : { source: "sceneFrameChrome" } })}
            options={[
              { value: "sceneFrameChrome", label: "Scene background chrome", icon: <Sparkles size={14} /> },
              { value: "asset", label: "Uploaded image", icon: <ImageIcon size={14} /> },
            ]}
          />
          {layer.src.source === "asset" && (
            <>
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onPickImageFile(file);
                  e.target.value = "";
                }}
              />
              {uploading && <span className="hint">Uploading...</span>}
              {layer.src.path && !uploading && <span className="hint">{layer.src.path}</span>}
              {uploadError && <div className="error-banner">{uploadError}</div>}
            </>
          )}
        </>
      )}

      <div>
        <div className="hint" style={{ marginBottom: 2 }}>
          Enter
        </div>
        <AnimationControl
          label="Enter"
          step={layer.animation.enter}
          allowTypewriter={layer.kind === "text"}
          onChange={(enter) => onChange({ ...layer, animation: { ...layer.animation, enter } } as Layer)}
        />
      </div>
      <div>
        <div className="hint" style={{ marginBottom: 2 }}>
          Exit
        </div>
        <AnimationControl label="Exit" step={layer.animation.exit} onChange={(exit) => onChange({ ...layer, animation: { ...layer.animation, exit } } as Layer)} />
      </div>
      <Knob label="delay" value={layer.animation.delayFrames} min={0} max={Math.max(90, fps * 3)} onChange={(v) => onChange({ ...layer, animation: { ...layer.animation, delayFrames: Math.round(v) } } as Layer)} />
    </div>
  );
}
