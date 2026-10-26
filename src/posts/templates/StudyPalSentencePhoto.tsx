import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { hexToRgba, resolvePostAsset, usePostHold } from "../PostReady";
import { loadPostFonts, postFonts } from "../fonts";
import { DrawingLayer, parseDrawing } from "../Drawing";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * One English sentence on a full-bleed photo (gui /sentence-post): a single
 * solid box holding three lines - the sentence, its Sinhala meaning and its
 * pronunciation - that slides from the top to the bottom of the image to keep
 * the photo's subject clear. Each line has its own size and color.
 * 1080x1920 (9:16).
 */

const W = 1080;
const H = 1920;

function StudyPalSentencePhoto({ fields, colors: c, insets }: PostTemplateProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const hold = usePostHold();

  const imgSrc = resolvePostAsset(fields.image ?? "");
  const num = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
  const zoom = num(fields.imageZoom, 100, 100, 400) / 100;
  const imgX = num(fields.imageX, 50, 0, 100);
  const imgY = num(fields.imageY, 50, 0, 100);
  const overlay = num(fields.overlayOpacity, 0, 0, 90) / 100;
  const boxOpacity = num(fields.boxOpacity, 100, 20, 100) / 100;
  // 0 = top, 100 = bottom of the free area.
  const posY = num(fields.offsetY, 30, 0, 100);

  // Block a render capture until the photo is decoded - otherwise renderStill can capture an empty <img>.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !imgSrc || img.complete) return;
    const release = hold("post: load image");
    img.addEventListener("load", release, { once: true });
    img.addEventListener("error", release, { once: true });
    return release;
  }, [imgSrc, hold]);

  const padX = Math.max(48, insets.left, insets.right);
  const padTop = Math.max(64, insets.top + 20);
  const padBottom = Math.max(64, insets.bottom + 20);
  const logoSize = num(fields.logoSize, 64, 32, 200);
  // 0-100% of the space inside the margins, so the mark never runs off the edge.
  const logoX = num(fields.logoX, 50, 0, 100);
  const logoY = num(fields.logoY, 100, 0, 100);
  const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  const line = (size: number, color: string, font: string, weight: number): CSSProperties => ({
    fontFamily: font,
    fontWeight: weight,
    fontSize: size,
    lineHeight: 1.4,
    color,
    textAlign: "center",
    textWrap: "balance",
    whiteSpace: "pre-line",
    overflowWrap: "break-word",
  } as CSSProperties);

  const lines = [
    { key: "sentence", lang: "en", style: line(num(fields.sentenceSize, 72, 28, 140), c.sentence, postFonts.display, 700) },
    { key: "meaning", lang: "si", style: line(num(fields.meaningSize, 52, 24, 120), c.meaning, postFonts.sinhala, 700) },
    { key: "pronunciation", lang: "si", style: line(num(fields.pronunciationSize, 44, 20, 110), c.pronunciation, postFonts.sinhala, 500) },
  ].filter((l) => fields[l.key]?.trim());

  return (
    <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: c.fallback }}>
      {imgSrc ? (
        <img
          ref={imgRef}
          src={imgSrc}
          alt=""
          style={{
            ...fill,
            // The whole photo stays inside the 1080x1920 canvas (never cropped);
            // a small one keeps its own size instead of being stretched. The
            // background color fills the rest; zoom enlarges it from the chosen point.
            objectFit: "scale-down",
            objectPosition: `${imgX}% ${imgY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${imgX}% ${imgY}%`,
          }}
        />
      ) : (
        <div style={{ ...fill, background: `radial-gradient(circle at 30% 20%, ${hexToRgba("#ffffff", 0.18)} 0%, transparent 55%), ${c.fallback}` }} />
      )}
      {/* Flat overlay for bright photos, so the box stands out. */}
      {overlay > 0 && <div style={{ ...fill, background: hexToRgba(c.overlay, overlay) }} />}

      {/* Flex spacers split the free height by the slider, so the box stays in flow. */}
      <div
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          top: padTop,
          bottom: padBottom,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: `${posY} 1 0`, minHeight: 0 }} />
        {lines.length > 0 && (
          <div
            style={{
              flex: "none",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              background: hexToRgba(c.boxBg, boxOpacity),
              padding: "44px 48px",
            }}
          >
            {lines.map((l) => (
              <div key={l.key} lang={l.lang} style={l.style}>
                {fields[l.key]}
              </div>
            ))}
          </div>
        )}
        <div style={{ flex: `${100 - posY} 1 0`, minHeight: 0 }} />
      </div>

      {/* StudyPal mark, placed anywhere inside the margins by the two sliders. */}
      <div style={{ position: "absolute", left: padX, right: padX, top: padTop, bottom: padBottom, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            left: `${logoX}%`,
            top: `${logoY}%`,
            transform: `translate(-${logoX}%, -${logoY}%)`,
            display: "flex",
            alignItems: "center",
            gap: logoSize * 0.25,
            color: c.brandText,
            fontFamily: postFonts.display,
            fontWeight: 700,
            fontSize: logoSize * 0.6,
            whiteSpace: "nowrap",
            textShadow: `0 2px 10px ${hexToRgba("#000000", 0.5)}`,
          }}
        >
          <StudyPalLogo size={logoSize} tile={c.brandTile} ink={c.brandInk} />
          {fields.brand?.trim()}
        </div>
      </div>

      {/* Pencil lines from the preview's drawing toolbar (gui DrawingPad.tsx) - over everything. */}
      <DrawingLayer strokes={parseDrawing(fields.drawing)} width={W} height={H} />
    </div>
  );
}

export const SENTENCE_DRAW_FIELD = "drawing";

export const studyPalSentencePhoto: PostTemplateDef = {
  id: "studypal-sentence-photo",
  name: "Sentence · Story 9:16",
  description: "1080×1920 · a photo with one box: English sentence, Sinhala meaning, pronunciation",
  width: W,
  height: H,
  fields: [
    { key: "image", label: "Background photo", type: "image", hint: "Upload, paste a URL, or search free photos below. It sits inside the background without cropping. Empty = background color only." },
    { key: "imageZoom", label: "Photo zoom", type: "range", min: 100, max: 400, step: 5, unit: "%", hint: "The photo is shown whole on a 1080×1920 background. Zoom in to make it bigger or to fill the background." },
    { key: "imageX", label: "Photo position - left / right", type: "range", min: 0, max: 100, unit: "%", hint: "Where the photo sits on the background (and the point zoom grows from): 0 = left edge, 100 = right edge." },
    { key: "imageY", label: "Photo position - up / down", type: "range", min: 0, max: 100, unit: "%" },
    { key: "overlayOpacity", label: "Dark overlay", type: "range", min: 0, max: 90, unit: "%", hint: "Darkens a bright photo so the box stands out. Color under Colors (Photo overlay)." },
    { key: "offsetY", label: "Box position", type: "range", min: 0, max: 100, unit: "%", hint: "0 = top, 100 = bottom. Keep the photo's subject clear." },
    { key: "boxOpacity", label: "Box opacity", type: "range", min: 20, max: 100, unit: "%", hint: "Lower lets the photo show through the box. Color under Colors (Box)." },
    { key: "brand", label: "Name next to the logo", type: "text", hint: "Empty = the logo only." },
    { key: "logoSize", label: "Logo size", type: "range", min: 32, max: 200, unit: "px" },
    { key: "logoX", label: "Logo position - left / right", type: "range", min: 0, max: 100, unit: "%", hint: "0 = left edge, 50 = center, 100 = right edge." },
    { key: "logoY", label: "Logo position - up / down", type: "range", min: 0, max: 100, unit: "%", hint: "0 = top, 100 = bottom." },
    { key: "sentence", label: "English sentence", type: "textarea" },
    { key: "sentenceSize", label: "Sentence size", type: "range", min: 28, max: 140, unit: "px" },
    { key: "meaning", label: "Meaning (Sinhala)", type: "textarea", lang: "si", hint: "Empty hides the line." },
    { key: "meaningSize", label: "Meaning size", type: "range", min: 24, max: 120, unit: "px" },
    { key: "pronunciation", label: "Pronunciation", type: "textarea", lang: "si", hint: "Empty hides the line." },
    { key: "pronunciationSize", label: "Pronunciation size", type: "range", min: 20, max: 110, unit: "px" },
  ],
  colors: [
    { key: "boxBg", label: "Box" },
    { key: "sentence", label: "Sentence text" },
    { key: "meaning", label: "Meaning text" },
    { key: "pronunciation", label: "Pronunciation text" },
    { key: "brandTile", label: "Logo tile" },
    { key: "brandInk", label: "Logo mark" },
    { key: "brandText", label: "Logo name text" },
    { key: "overlay", label: "Photo overlay" },
    { key: "fallback", label: "Background (around the photo)" },
  ],
  defaultFields: {
    image: "",
    imageZoom: "100",
    imageX: "50",
    imageY: "50",
    overlayOpacity: "0",
    offsetY: "30",
    boxOpacity: "100",
    brand: "StudyPal",
    logoSize: "64",
    logoX: "50",
    logoY: "100",
    sentence: "Don't fish in troubled waters.",
    sentenceSize: "72",
    meaning: "බොර දියේ මාළු බානවා",
    meaningSize: "52",
    pronunciation: "ඩෝන්ට් ෆිෂ් ඉන් ට්‍රබල්ඩ් වෝටර්ස්",
    pronunciationSize: "44",
    // Not in `fields` - edited with the pencil on the preview, not a form input.
    drawing: "[]",
  },
  defaultColors: {
    boxBg: "#000000",
    sentence: "#FFFFFF",
    meaning: "#F9B200",
    pronunciation: "#D9D9D9",
    brandTile: "#F9B200",
    brandInk: "#591F82",
    brandText: "#FFFFFF",
    overlay: "#000000",
    fallback: "#591F82",
  },
  colorsFromPalette: (p) => ({
    boxBg: "#000000",
    sentence: "#FFFFFF",
    meaning: p.gold,
    pronunciation: "#D9D9D9",
    brandTile: p.gold,
    brandInk: p.primary,
    brandText: "#FFFFFF",
    overlay: "#000000",
    fallback: p.primary,
  }),
  suggestCaption: (f) =>
    [f.sentence?.trim(), f.meaning?.trim() ? `👉 ${f.meaning.trim()}` : "", f.pronunciation?.trim() ? `🗣️ ${f.pronunciation.trim()}` : ""].filter(Boolean).join("\n"),
  captionContext: (f) => ({
    format: "list",
    topic: null,
    items: f.sentence?.trim() ? [{ english: f.sentence.trim(), sinhala: f.meaning?.trim() || null, pronunciation: f.pronunciation?.trim() || null }] : [],
  }),
  loadFonts: loadPostFonts,
  component: StudyPalSentencePhoto,
};
