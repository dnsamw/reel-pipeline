import { useRef, type CSSProperties } from "react";
import { loadFont as loadPatrickHand } from "@remotion/google-fonts/PatrickHand";
import { useShrinkToFit } from "../useFitFontSize";
import { loadPostFonts, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * Classroom word chart (gui /word-chart): a framed card with a title in a
 * rounded pill, then "left -> right" rows (I -> am, He -> is ...) - each row's
 * two words can have their own color, falling back to the Left / Right word
 * colors. Handwritten font by default (Patrick Hand), like a teacher's chart;
 * untick it for the StudyPal fonts. Row text uses the px sizes from the form,
 * multiplied by --s, which useShrinkToFit lowers only if the rows overflow.
 * One component, two sizes (9:16 story and 4:5 feed).
 */

const handFont = `"Patrick Hand", "Comic Sans MS", cursive`;

let handLoaded: Promise<unknown> | null = null;
function loadChartFonts(): Promise<unknown> {
  handLoaded ??= Promise.all([loadPostFonts(), loadPatrickHand("normal", { weights: ["400"], subsets: ["latin"] }).waitUntilDone()]);
  return handLoaded;
}

function Arrow({ width, color }: { width: number; color: string }) {
  // Drawn rather than typed, so it looks the same in every font.
  return (
    <svg viewBox="0 0 100 40" style={{ width: `calc(${width}px * var(--s))`, height: `calc(${width * 0.4}px * var(--s))`, flex: "none", overflow: "visible" }}>
      <g fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 20 H92" />
        <path d="M76 6 L94 20 L76 34" />
      </g>
    </svg>
  );
}

function makeComponent(width: number, height: number) {
  return function StudyPalWordChart({ fields, lists, colors: c, insets }: PostTemplateProps) {
    const rowsRef = useRef<HTMLDivElement>(null);
    const num = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
    const tall = height / width > 1.5;

    const rows = (lists.items ?? []).filter((it) => it.left?.trim() || it.right?.trim());
    const hand = fields.handwritten !== "";
    const titleSize = num(fields.titleSize, tall ? 110 : 96, 30, 200);
    const leftSize = num(fields.leftSize, tall ? 110 : 88, 24, 200);
    const rightSize = num(fields.rightSize, tall ? 110 : 88, 24, 200);
    const arrowSize = num(fields.arrowSize, tall ? 150 : 120, 40, 300);
    const logoSize = num(fields.logoSize, tall ? 64 : 56, 30, 160);
    // 0-100% of the whole card (a small margin in from its edge) - not limited to the safe-zone
    // padding the rows use, so the logo can sit right at the card's top or bottom.
    const logoX = num(fields.logoX, 50, 0, 100);
    const logoY = num(fields.logoY, 100, 0, 100);
    const frame = num(fields.frameWidth, 10, 0, 40);

    // The card always fills the post (a fixed small margin); the safe-zone insets only push the
    // card's contents inward, so with "Reels safe zones" on the card doesn't shrink - its padding grows.
    const margin = 32;
    const inner = (design: number, inset: number) => Math.max(design, inset - margin - frame);
    const pad = {
      top: inner(tall ? 64 : 48, insets.top),
      right: inner(tall ? 56 : 48, insets.right),
      bottom: inner(tall ? 48 : 36, insets.bottom),
      left: inner(tall ? 56 : 48, insets.left),
    };

    useShrinkToFit(
      rowsRef,
      (s) => rowsRef.current?.style.setProperty("--s", String(s)),
      { max: 1, min: 0.3, step: 0.02 },
      [JSON.stringify(rows), leftSize, rightSize, arrowSize, titleSize, fields.title, hand, JSON.stringify(insets)],
    );

    const wordFont = hand ? handFont : postFonts.display;
    const word = (size: number, color: string): CSSProperties => ({
      fontFamily: wordFont,
      fontWeight: hand ? 400 : 700,
      fontSize: `calc(${size}px * var(--s))`,
      lineHeight: 1.15,
      color,
      whiteSpace: "nowrap",
    });
    const validColor = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim()) ? v.trim() : fallback);

    return (
      <div style={{ width, height, position: "relative", overflow: "hidden", background: c.bg, boxSizing: "border-box", padding: margin }}>
        {/* The chart card */}
        <div
          style={{
            height: "100%",
            boxSizing: "border-box",
            background: c.card,
            border: frame > 0 ? `${frame}px solid ${c.frame}` : "none",
            borderRadius: 56,
            position: "relative",
            padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {fields.title?.trim() && (
            <div
              style={{
                flex: "none",
                maxWidth: "100%",
                boxSizing: "border-box",
                background: c.titleBg,
                border: `${Math.max(4, frame * 0.7)}px solid ${c.titleBorder}`,
                borderRadius: 40,
                padding: `${titleSize * 0.12}px ${titleSize * 0.5}px`,
                fontFamily: wordFont,
                fontWeight: hand ? 400 : 800,
                fontSize: titleSize,
                lineHeight: 1.2,
                color: c.title,
                textAlign: "center",
              }}
            >
              {fields.title}
            </div>
          )}

          {/* Rows - one grid so the arrows and right words line up; position: relative for the fit measurement. */}
          <div
            ref={rowsRef}
            style={
              {
                "--s": 1,
                flex: "1 1 0",
                minHeight: 0,
                position: "relative",
                marginTop: tall ? 48 : 32,
                display: "grid",
                gridTemplateColumns: "auto auto auto",
                justifyContent: "center",
                alignContent: "space-evenly",
                alignItems: "center",
                columnGap: `calc(${Math.max(leftSize, rightSize) * 0.35}px * var(--s))`,
              } as CSSProperties
            }
          >
            {rows.map((it, i) => (
              <div key={i} style={{ display: "contents" }}>
                <div style={word(leftSize, validColor(it.leftColor, c.left))}>{it.left}</div>
                {it.left?.trim() && it.right?.trim() ? <Arrow width={arrowSize} color={c.arrow} /> : <div />}
                <div style={word(rightSize, validColor(it.rightColor, c.right))}>{it.right}</div>
              </div>
            ))}
          </div>

          {/* Keep the logo's default bottom spot free of rows; the logo itself is placed by the two sliders. */}
          <div style={{ flex: "none", height: logoSize + (tall ? 32 : 20) }} />
          <div style={{ position: "absolute", inset: 28, pointerEvents: "none" }}>
            <div
              style={{
                position: "absolute",
                left: `${logoX}%`,
                top: `${logoY}%`,
                transform: `translate(-${logoX}%, -${logoY}%)`,
                display: "flex",
                alignItems: "center",
                gap: logoSize * 0.25,
              }}
            >
              <StudyPalLogo size={logoSize} tile={c.brandTile} ink={c.brandInk} />
              {fields.brand?.trim() && (
                <span style={{ fontFamily: postFonts.display, fontWeight: 700, fontSize: logoSize * 0.61, color: c.brandText, whiteSpace: "nowrap" }}>{fields.brand}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };
}

function makeWordChart(id: string, name: string, description: string, width: number, height: number): PostTemplateDef {
  const tall = height / width > 1.5;
  return {
    id,
    name,
    description,
    width,
    height,
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "titleSize", label: "Title size", type: "range", min: 30, max: 200, unit: "px" },
      {
        key: "items",
        label: "Rows",
        type: "list",
        itemLabel: "Row",
        minItems: 1,
        maxItems: 14,
        hint: "Empty row colors use the Left words / Right words colors (Colors card). Rows shrink together if they don't fit.",
        itemFields: [
          { key: "left", label: "Left word", type: "text" },
          { key: "right", label: "Right word", type: "text" },
          { key: "leftColor", label: "Left word color", type: "color" },
          { key: "rightColor", label: "Right word color", type: "color" },
        ],
      },
      { key: "leftSize", label: "Left words size", type: "range", min: 24, max: 200, unit: "px" },
      { key: "rightSize", label: "Right words size", type: "range", min: 24, max: 200, unit: "px" },
      { key: "arrowSize", label: "Arrow length", type: "range", min: 40, max: 300, unit: "px" },
      { key: "handwritten", label: "Handwritten font", type: "checkbox", hint: "Like a teacher's chart. Untick for the StudyPal fonts." },
      { key: "frameWidth", label: "Frame thickness", type: "range", min: 0, max: 40, unit: "px", hint: "0 = no frame." },
      { key: "brand", label: "Name next to the logo", type: "text", hint: "Empty = the logo only." },
      { key: "logoSize", label: "Logo size", type: "range", min: 30, max: 160, unit: "px" },
      { key: "logoY", label: "Logo position - up / down", type: "range", min: 0, max: 100, unit: "%", hint: "0 = top of the card, 100 = bottom. Moves over the whole card, even outside the Reels safe zone." },
      { key: "logoX", label: "Logo position - left / right", type: "range", min: 0, max: 100, unit: "%", hint: "0 = left, 50 = center, 100 = right." },
    ],
    colors: [
      { key: "bg", label: "Background (around the card)" },
      { key: "card", label: "Card" },
      { key: "frame", label: "Card frame" },
      { key: "title", label: "Title text" },
      { key: "titleBg", label: "Title box" },
      { key: "titleBorder", label: "Title box border" },
      { key: "left", label: "Left words" },
      { key: "arrow", label: "Arrows" },
      { key: "right", label: "Right words" },
      { key: "brandTile", label: "Logo tile" },
      { key: "brandInk", label: "Logo mark" },
      { key: "brandText", label: "Logo name text" },
    ],
    defaultFields: {
      title: "1. is / are / am",
      titleSize: tall ? "110" : "96",
      leftSize: tall ? "110" : "88",
      rightSize: tall ? "110" : "88",
      arrowSize: tall ? "150" : "120",
      handwritten: "1",
      frameWidth: "10",
      brand: "StudyPal",
      logoSize: tall ? "64" : "56",
      logoX: "50",
      logoY: "100",
    },
    defaultLists: {
      items: [
        { left: "I", right: "am", leftColor: "#1A1A1A", rightColor: "" },
        { left: "He", right: "is", leftColor: "#1A1A1A", rightColor: "" },
        { left: "She", right: "is", leftColor: "#E83E8C", rightColor: "" },
        { left: "It", right: "is", leftColor: "#2E9E4F", rightColor: "" },
        { left: "You", right: "are", leftColor: "#2B78D0", rightColor: "" },
        { left: "We", right: "are", leftColor: "#6A3FB5", rightColor: "" },
        { left: "They", right: "are", leftColor: "#E83E8C", rightColor: "" },
      ],
    },
    defaultColors: {
      bg: "#E6F7FC",
      card: "#FFFEF8",
      frame: "#8FD3E8",
      title: "#1F2A44",
      titleBg: "#E6F7FC",
      titleBorder: "#F28DB2",
      left: "#1A1A1A",
      arrow: "#F5A623",
      right: "#E8622A",
      brandTile: "#F9B200",
      brandInk: "#591F82",
      brandText: "#591F82",
    },
    colorsFromPalette: (p, variant) =>
      variant === "dark"
        ? { bg: p.primary, card: "#1C1530", frame: p.gold, title: "#FFFFFF", titleBg: p.primary, titleBorder: p.gold, left: "#FFFFFF", arrow: p.gold, right: p.gold, brandTile: p.gold, brandInk: p.primary, brandText: "#FFFFFF" }
        : { bg: "#E6F7FC", card: "#FFFEF8", frame: "#8FD3E8", title: p.primary, titleBg: "#E6F7FC", titleBorder: "#F28DB2", left: "#1A1A1A", arrow: p.gold, right: "#E8622A", brandTile: p.gold, brandInk: p.primary, brandText: p.primary },
    suggestCaption: (f, l) =>
      [
        f.title?.trim() ?? "",
        (l.items ?? [])
          .filter((it) => it.left?.trim() || it.right?.trim())
          .map((it) => [it.left?.trim(), it.right?.trim()].filter(Boolean).join(" → "))
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    captionContext: (f, l) => ({
      format: "list",
      topic: f.title || null,
      items: (l.items ?? [])
        .filter((it) => it.left?.trim() || it.right?.trim())
        .map((it) => ({ english: [it.left?.trim(), it.right?.trim()].filter(Boolean).join(" "), sinhala: null, pronunciation: null })),
    }),
    loadFonts: loadChartFonts,
    component: makeComponent(width, height),
  };
}

export const studyPalWordChartStory = makeWordChart("studypal-word-chart-story", "Word Chart · Story 9:16", "1080×1920 · title pill, word → word rows, each word its own color", 1080, 1920);
export const studyPalWordChartFeed = makeWordChart("studypal-word-chart-feed", "Word Chart · Feed 4:5", "1080×1350 · title pill, word → word rows, each word its own color", 1080, 1350);
