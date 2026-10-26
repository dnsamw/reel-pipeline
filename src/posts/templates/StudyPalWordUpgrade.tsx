import { useRef, type CSSProperties } from "react";
import { hexToRgba, mixHex } from "../PostReady";
import { useShrinkToFit } from "../useFitFontSize";
import { englishFontChoices, englishFontFamily, loadPostFontsWithChoices, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import { Background3D } from "../Background3D";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * Basic -> Advanced word list (gui /word-upgrade, under English): an optional
 * title, two dark header tabs ("Basic" / "Advanced") over the columns, then
 * "• Sometimes ———> Occasionally" rows - the arrow stretches from the end of
 * each left word to the right column, so the right words line up. Row text
 * uses the px sizes from the form, multiplied by --s, which useShrinkToFit
 * lowers only if the rows overflow. One component, two sizes (9:16, 4:5).
 */

function Arrow({ thickness, color, gap }: { thickness: number; color: string; gap: string }) {
  const head = Math.max(10, thickness * 5);
  return (
    <div style={{ flex: "1 1 0", minWidth: `calc(60px * var(--s))`, display: "flex", alignItems: "center", margin: `0 ${gap}` }}>
      <div style={{ flex: "1 1 0", height: thickness, background: color, marginRight: -thickness }} />
      {/* Open chevron head, like a hand-drawn → */}
      <svg viewBox="0 0 10 10" style={{ width: head, height: head, flex: "none", overflow: "visible" }}>
        <path d="M3 1.5 L9 5 L3 8.5" fill="none" stroke={color} strokeWidth={(thickness * 10) / head} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function makeComponent(width: number, height: number) {
  return function StudyPalWordUpgrade({ fields, lists, colors: c, insets }: PostTemplateProps) {
    const rowsRef = useRef<HTMLDivElement>(null);
    const num = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
    const tall = height / width > 1.5;

    const rows = (lists.items ?? []).filter((it) => it.left?.trim() || it.right?.trim());
    const font = englishFontFamily(fields.englishFont) ?? postFonts.body;
    const titleSize = num(fields.titleSize, tall ? 84 : 72, 24, 180);
    const headerSize = num(fields.headerSize, tall ? 58 : 50, 20, 120);
    const wordSize = num(fields.wordSize, tall ? 58 : 50, 20, 120);
    const weight = num(fields.wordWeight, 700, 300, 800);
    const arrowThickness = num(fields.arrowThickness, 3, 1, 12);
    const bullets = fields.bullets !== "";
    const logoSize = num(fields.logoSize, tall ? 60 : 52, 30, 160);
    const logoX = num(fields.logoX, 50, 0, 100);
    const logoY = num(fields.logoY, 100, 0, 100);

    const pad = {
      top: Math.max(tall ? 110 : 70, insets.top),
      right: Math.max(48, insets.right),
      bottom: Math.max(tall ? 70 : 50, insets.bottom),
      left: Math.max(48, insets.left),
    };
    // Where the word columns start / end, in px from the post's edges (never inside the safe-zone insets).
    // Relative to the padding above, so it can be smaller than the title's margin.
    const colLeft = Math.max(num(fields.columnsLeft, 72, 0, 500), insets.left) - pad.left;
    const colRight = Math.max(num(fields.columnsRight, 72, 0, 500), insets.right) - pad.right;

    useShrinkToFit(
      rowsRef,
      (s) => rowsRef.current?.style.setProperty("--s", String(s)),
      {
        max: 1,
        min: 0.3,
        step: 0.02,
        // Words don't wrap, so a long left word + arrow can be too wide for its column - shrink for that too.
        alsoOver: () => Array.from(rowsRef.current?.querySelectorAll<HTMLElement>("[data-left-cell]") ?? []).some((el) => el.scrollWidth > el.clientWidth + 1),
      },
      [JSON.stringify(rows), fields.columnsLeft, fields.columnsRight, wordSize, headerSize, weight, arrowThickness, bullets, fields.englishFont, fields.leftHeader, fields.rightHeader, titleSize, fields.title, logoSize, JSON.stringify(insets)],
    );

    const s = (px: number) => `calc(${px}px * var(--s))`;
    const validColor = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim()) ? v.trim() : fallback);
    const text = (color: string): CSSProperties => ({ fontFamily: font, fontWeight: weight, fontSize: s(wordSize), lineHeight: 1.2, color, whiteSpace: "nowrap" });
    // offset: px to slide the box sideways from the center of its column (- = left, + = right).
    const tab = (label: string | undefined, offset: number) =>
      label?.trim() ? (
        <div
          style={{
            justifySelf: "center",
            transform: offset ? `translateX(${offset}px)` : undefined,
            background: c.headerBg,
            color: c.headerText,
            fontFamily: font,
            fontWeight: 700,
            fontSize: s(headerSize),
            lineHeight: 1.2,
            padding: `${s(headerSize * 0.28)} ${s(headerSize * 0.6)}`,
            borderRadius: s(headerSize * 0.28),
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      ) : (
        <div />
      );

    return (
      <div
        style={{
          width,
          height,
          position: "relative",
          overflow: "hidden",
          // A soft top-to-bottom shade, like the paper in the original.
          background: `linear-gradient(to bottom, ${mixHex(c.bg, "#000000", 0.07)} 0%, ${c.bg} 22%, ${c.bg} 100%)`,
          boxSizing: "border-box",
          padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {fields.bg3d === "1" && <Background3D width={width} height={height} bg={c.bg} line={hexToRgba(c.arrow, 0.18)} accentA={c.ball1} accentB={c.ball2} />}
        {/* Everything above the logo spot shrinks together if it doesn't fit. */}
        <div ref={rowsRef} style={{ "--s": 1, flex: "1 1 0", minHeight: 0, position: "relative", display: "flex", flexDirection: "column" } as CSSProperties}>
          {fields.title?.trim() && (
            <div style={{ flex: "none", fontFamily: font, fontWeight: 800, fontSize: s(titleSize), lineHeight: 1.15, color: c.title, textAlign: "center", marginBottom: s(titleSize * 0.5), textWrap: "balance" } as CSSProperties}>
              {fields.title}
            </div>
          )}
          {/* One grid: the right column starts at the same x on every row, the left column's arrow fills the rest. */}
          <div
            style={{
              flex: "1 1 auto",
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              margin: `0 ${colRight}px 0 ${colLeft}px`,
              alignContent: "space-evenly",
              alignItems: "center",
              rowGap: s(wordSize * 0.35),
            }}
          >
            {(fields.leftHeader?.trim() || fields.rightHeader?.trim()) && (
              <>
                {tab(fields.leftHeader, num(fields.leftHeaderX, 0, -400, 400))}
                {tab(fields.rightHeader, num(fields.rightHeaderX, 0, -400, 400))}
              </>
            )}
            {rows.map((it, i) => (
              <div key={i} style={{ display: "contents" }}>
                <div data-left-cell style={{ display: "flex", alignItems: "center", minWidth: 0, overflow: "hidden" }}>
                  {bullets && <span style={{ ...text(validColor(it.leftColor, c.left)), marginRight: s(wordSize * 0.45) }}>•</span>}
                  <span style={text(validColor(it.leftColor, c.left))}>{it.left}</span>
                  {it.left?.trim() && it.right?.trim() && <Arrow thickness={arrowThickness} color={c.arrow} gap={s(wordSize * 0.4)} />}
                </div>
                <div style={text(validColor(it.rightColor, c.right))}>{it.right}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Keep the logo's default bottom spot free; the logo itself is placed by the two sliders. */}
        <div style={{ flex: "none", height: logoSize + (tall ? 36 : 24) }} />
        <div style={{ position: "absolute", inset: 32, pointerEvents: "none" }}>
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
    );
  };
}

const defaultRows: [string, string][] = [
  ["Sometimes", "Occasionally"],
  ["Soon", "Shortly"],
  ["Now", "Immediately"],
  ["Again", "Repeatedly"],
  ["Hard", "Diligently"],
  ["Very", "Extremely"],
  ["Really", "Truly"],
  ["Quickly", "Rapidly"],
  ["Slowly", "Gradually"],
  ["Clearly", "Evidently"],
  ["Carefully", "Cautiously"],
  ["Loudly", "Forcefully"],
  ["Softly", "Gently"],
  ["Always", "Consistently"],
  ["Often", "Frequently"],
];

function makeWordUpgrade(id: string, name: string, description: string, width: number, height: number): PostTemplateDef {
  const tall = height / width > 1.5;
  return {
    id,
    name,
    description,
    width,
    height,
    fields: [
      { key: "bg3d", label: "3D background", type: "checkbox", hint: "Adds lighting, a perspective floor grid and glossy balls in the corners. Ball colors under Colors (3D ball 1 / 2)." },
      { key: "title", label: "Title", type: "textarea", hint: "Optional - empty hides it." },
      { key: "titleSize", label: "Title size", type: "range", min: 24, max: 180, unit: "px" },
      { key: "leftHeader", label: "Left column heading", type: "text", hint: "Empty hides it (both empty = no heading row)." },
      { key: "rightHeader", label: "Right column heading", type: "text" },
      { key: "headerSize", label: "Heading size", type: "range", min: 20, max: 120, unit: "px" },
      { key: "leftHeaderX", label: "Left heading position - left / right", type: "range", min: -400, max: 400, unit: "px", hint: "0 = centered over its column. Minus moves it left, plus moves it right." },
      { key: "rightHeaderX", label: "Right heading position - left / right", type: "range", min: -400, max: 400, unit: "px", hint: "0 = centered over its column." },
      {
        key: "items",
        label: "Rows",
        type: "list",
        itemLabel: "Row",
        minItems: 1,
        maxItems: 20,
        hint: "Empty row colors use the Left words / Right words colors (Colors card). Rows shrink together if they don't fit.",
        itemFields: [
          { key: "left", label: "Left word", type: "text" },
          { key: "right", label: "Right word", type: "text" },
          { key: "leftColor", label: "Left word color", type: "color" },
          { key: "rightColor", label: "Right word color", type: "color" },
        ],
      },
      { key: "wordSize", label: "Word size", type: "range", min: 20, max: 120, unit: "px" },
      { key: "columnsLeft", label: "Left margin", type: "range", min: 0, max: 500, unit: "px", hint: "Space from the post's left edge to the left words (bullets)." },
      { key: "columnsRight", label: "Right margin", type: "range", min: 0, max: 500, unit: "px", hint: "Space from the right words to the post's right edge. More margin = shorter arrows." },
      { key: "englishFont", label: "Font", type: "select", options: englishFontChoices, hint: "For the title, headings and words." },
      { key: "wordWeight", label: "Boldness", type: "range", min: 300, max: 800, step: 100, hint: "400 = regular, 700 = bold (default)." },
      { key: "bullets", label: "Bullets before the left words", type: "checkbox" },
      { key: "arrowThickness", label: "Arrow thickness", type: "range", min: 1, max: 12, unit: "px" },
      { key: "brand", label: "Name next to the logo", type: "text", hint: "Empty = the logo only." },
      { key: "logoSize", label: "Logo size", type: "range", min: 30, max: 160, unit: "px" },
      { key: "logoY", label: "Logo position - up / down", type: "range", min: 0, max: 100, unit: "%", hint: "0 = top, 100 = bottom." },
      { key: "logoX", label: "Logo position - left / right", type: "range", min: 0, max: 100, unit: "%", hint: "0 = left, 50 = center, 100 = right." },
    ],
    colors: [
      { key: "bg", label: "Background" },
      { key: "title", label: "Title" },
      { key: "headerBg", label: "Heading box" },
      { key: "headerText", label: "Heading text" },
      { key: "left", label: "Left words" },
      { key: "arrow", label: "Arrows" },
      { key: "right", label: "Right words" },
      { key: "ball1", label: "3D ball 1 (big, top-right)" },
      { key: "ball2", label: "3D ball 2 (bottom-left)" },
      { key: "brandTile", label: "Logo tile" },
      { key: "brandInk", label: "Logo mark" },
      { key: "brandText", label: "Logo name text" },
    ],
    defaultFields: {
      bg3d: "",
      title: "",
      titleSize: tall ? "84" : "72",
      leftHeader: "Basic",
      rightHeader: "Advanced",
      headerSize: tall ? "58" : "50",
      leftHeaderX: "0",
      rightHeaderX: "0",
      wordSize: tall ? "58" : "50",
      columnsLeft: "72",
      columnsRight: "72",
      englishFont: "noto-sans",
      wordWeight: "700",
      bullets: "1",
      arrowThickness: "3",
      brand: "StudyPal",
      logoSize: tall ? "60" : "52",
      logoX: "50",
      logoY: "100",
    },
    defaultLists: {
      items: defaultRows.map(([left, right]) => ({ left, right, leftColor: "", rightColor: "" })),
    },
    // The original post's colors: light grey paper, near-black text, black heading tabs.
    defaultColors: {
      bg: "#ECECEC",
      title: "#111111",
      headerBg: "#111111",
      headerText: "#F2F2F2",
      left: "#111111",
      arrow: "#111111",
      right: "#111111",
      // Monochrome like the rest of the post - change them for a pop of color.
      ball1: "#2A2A2A",
      ball2: "#8C8C8C",
      brandTile: "#111111",
      brandInk: "#F2F2F2",
      brandText: "#111111",
    },
    colorsFromPalette: (p, variant) =>
      variant === "dark"
        ? { ball1: p.gold, ball2: "#FFFFFF", bg: p.primary, title: "#FFFFFF", headerBg: p.gold, headerText: p.primary, left: "#FFFFFF", arrow: p.gold, right: p.gold, brandTile: p.gold, brandInk: p.primary, brandText: "#FFFFFF" }
        : { ball1: p.primary, ball2: p.gold, bg: "#ECECEC", title: p.primary, headerBg: p.primary, headerText: "#FFFFFF", left: "#111111", arrow: p.primary, right: p.primary, brandTile: p.gold, brandInk: p.primary, brandText: p.primary },
    suggestCaption: (f, l) => {
      const head = [f.leftHeader?.trim(), f.rightHeader?.trim()].filter(Boolean).join(" → ");
      return [
        f.title?.trim() || head,
        (l.items ?? [])
          .filter((it) => it.left?.trim() || it.right?.trim())
          .map((it) => `• ${[it.left?.trim(), it.right?.trim()].filter(Boolean).join(" → ")}`)
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n");
    },
    captionContext: (f, l) => ({
      format: "list",
      topic: f.title || [f.leftHeader, f.rightHeader].filter(Boolean).join(" vs ") || null,
      items: (l.items ?? [])
        .filter((it) => it.left?.trim() || it.right?.trim())
        .map((it) => ({ english: [it.left?.trim(), it.right?.trim()].filter(Boolean).join(" → "), sinhala: null, pronunciation: null })),
    }),
    loadFonts: loadPostFontsWithChoices,
    component: makeComponent(width, height),
  };
}

export const studyPalWordUpgradeStory = makeWordUpgrade("studypal-word-upgrade-story", "Basic → Advanced · Story 9:16", "1080×1920 · heading tabs, • basic ———> advanced rows", 1080, 1920);
export const studyPalWordUpgradeFeed = makeWordUpgrade("studypal-word-upgrade-feed", "Basic → Advanced · Feed 4:5", "1080×1350 · heading tabs, • basic ———> advanced rows", 1080, 1350);
