import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { hexToRgba, mixHex, resolvePostAsset, usePostHold } from "../PostReady";
import { useShrinkToFit } from "../useFitFontSize";
import { englishFontChoices, englishFontFamily, loadPostFontsWithChoices, postFonts, sinhalaFontChoices, sinhalaFontFamily } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import { Background3D } from "../Background3D";
import type { PostFieldDef, PostTemplateDef, PostTemplateProps } from "../types";

/**
 * Vocabulary table (gui /vocab-post): a title, a Sinhala subtitle, then one
 * row per word - English word with its (pronunciation) under it | Sinhala
 * meaning - with the StudyPal logo at the bottom. Rows sit in a single grid so
 * the two columns line up. Row text uses the px sizes set in the form; every row dimension
 * is multiplied by --s, which useShrinkToFit lowers only if the rows would
 * overflow, so the sizes are exact whenever they fit. One
 * component, two sizes (9:16 story and 4:5 feed) - see makeVocab. The
 * `photo` variants (gui /vocab-photo-post) add a background photo under a
 * tinted overlay, so the same rows stay readable on any picture.
 */
const LOGO_MARGIN = 40;
const logoRow = (size: number): CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: size * 0.25,
});
// Text-to-tile ratio of the original 72px logo / 44px text.
const brandText = (size: number, color: string): CSSProperties => ({
  fontFamily: postFonts.display,
  fontWeight: 700,
  fontSize: size * 0.61,
  letterSpacing: "-0.01em",
  color,
  whiteSpace: "nowrap",
});

const WORD_LH = 1.15;
const MEANING_LH = 1.35;

function makeComponent(width: number, height: number, photo: boolean) {
  return function StudyPalVocab({ fields, lists, colors, insets }: PostTemplateProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    const hold = usePostHold();

    const pct = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
    const imgSrc = photo ? resolvePostAsset(fields.image ?? "") : "";
    // The photo's box as a % of the post - 100 x 100 fits it exactly (stretched if its shape differs).
    const imgW = pct(fields.imageWidth, 100, 10, 300);
    const imgH = pct(fields.imageHeight, 100, 10, 300);
    const imgX = pct(fields.imageX, 50, 0, 100);
    const imgY = pct(fields.imageY, 50, 0, 100);
    // Off by default so the photo shows clearly. (Renamed from overlayOpacity, whose old 70% default
    // made photos look misty - a new key means drafts saved with that 70% start clear too.)
    const overlay = pct(fields.photoTint, 0, 0, 100) / 100;
    // Logo size and (photo variants) position: 0-100% of the post inside a small margin.
    const baseLogo = height / width > 1.5 ? 72 : 60;
    const logoSize = photo ? pct(fields.logoSize, baseLogo, 30, 200) : baseLogo;
    const logoX = pct(fields.logoX, 50, 0, 100);
    const logoY = pct(fields.logoY, 100, 0, 100);
    // Photo variants only: 0 = transparent background (the PNG keeps the alpha), 100 = solid color.
    const bgOpacity = photo ? pct(fields.backgroundOpacity, 0, 0, 100) / 100 : 1;
    const photoBox: CSSProperties = {
      position: "absolute",
      width: `${imgW}%`,
      height: `${imgH}%`,
      // Position slides the box between the edges: 0 = flush left/top, 100 = flush right/bottom.
      left: `${((100 - imgW) * imgX) / 100}%`,
      top: `${((100 - imgH) * imgY) / 100}%`,
    };

    // Block a render capture until the photo is decoded - otherwise renderStill can capture an empty <img>.
    useLayoutEffect(() => {
      const img = imgRef.current;
      if (!img || !imgSrc || img.complete) return;
      const release = hold("post: load image");
      img.addEventListener("load", release, { once: true });
      img.addEventListener("error", release, { once: true });
      return release;
    }, [imgSrc, hold]);

    const items = (lists.items ?? []).filter((it) => it.word || it.pron || it.meaning);
    // Subtitle, pronunciation and meaning - the "Sinhala font" select.
    const sinhalaFont = sinhalaFontFamily(fields.sinhalaFont);
    // Title and English words - null keeps the template's own fonts.
    const englishFont = englishFontFamily(fields.englishFont);
    const c = colors;
    const tall = height / width > 1.5;
    const titleSize = Number(fields.titleSize) || (tall ? 92 : 80);
    const size = {
      word: Number(fields.wordSize) || 50,
      pron: Number(fields.pronSize) || 36,
      meaning: Number(fields.meaningSize) || 36,
    };
    const columnGap = fields.columnGap === undefined || fields.columnGap === "" ? 56 : Math.max(0, Number(fields.columnGap) || 0);
    // Photo variants: extra room between the post's edges and the word table (0 = the normal layout).
    const tableLeft = photo ? pct(fields.tableMarginLeft, 0, 0, 300) : 0;
    const tableRight = photo ? pct(fields.tableMarginRight, 0, 0, 300) : 0;
    const titleRight = photo ? pct(fields.titleMarginRight, 0, 0, 500) : 0;
    const subtitleRight = photo ? pct(fields.subtitleMarginRight, 0, 0, 500) : 0;
    // Photo variants: a highlight behind each word, pronunciation and meaning (just the text, not the
    // whole table) so they read clearly on any photo. 0-1 opacity, 0 = off.
    const textBgOpacity = photo ? pct(fields.textBgOpacity, 0.9, 0, 1) : 0;
    const hl = (text: string) =>
      textBgOpacity > 0 ? (
        <span
          style={{
            background: hexToRgba(fields.textBgColor || "#ffffff", textBgOpacity),
            padding: "0.04em 0.3em",
            borderRadius: "0.2em",
            // Each wrapped line gets its own padded, rounded highlight.
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {text}
        </span>
      ) : (
        text
      );
    // The meaning sits on the English word's line (not centered on word + pronunciation):
    // both cells top-align, and the one with the shorter first line is pushed down so the two line centers match.
    const lineDiff = (size.word * WORD_LH - size.meaning * MEANING_LH) / 2;

    const pad = {
      top: Math.max(tall ? 120 : 80, insets.top),
      right: Math.max(64, insets.right),
      bottom: Math.max(tall ? 90 : 60, insets.bottom),
      left: Math.max(64, insets.left),
    };

    useShrinkToFit(listRef, (s) => rootRef.current?.style.setProperty("--s", String(s)), { max: 1, min: 0.3, step: 0.02 }, [
      JSON.stringify(items),
      fields.title,
      fields.titleSize,
      fields.titleMarginRight,
      fields.subtitleMarginRight,
      fields.wordSize,
      fields.pronSize,
      fields.meaningSize,
      fields.meaningWeight,
      fields.sinhalaFont,
      fields.englishFont,
      fields.wordWeight,
      fields.pronWeight,
      fields.columnGap,
      fields.tableMarginLeft,
      fields.tableMarginRight,
      fields.subtitle,
      fields.brand,
      JSON.stringify(insets),
    ]);

    const s = (px: number) => `calc(${px}px * var(--s))`;
    const divider = `2px solid ${c.divider}`;
    // No column gap - the gutter is padding on the first cell, so each row's divider runs unbroken across both.
    const cell = (i: number, last: boolean, extraTop: number): CSSProperties => ({
      padding: `${s(20 + extraTop)} ${last ? "0" : s(columnGap)} ${s(20)} 0`,
      borderTop: i > 0 ? divider : undefined,
      alignSelf: "stretch",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "center",
    });

    return (
      <div
        ref={rootRef}
        style={{
          width,
          height,
          position: "relative",
          overflow: "hidden",
          background: bgOpacity === 1 ? c.background : hexToRgba(c.background, bgOpacity),
          fontFamily: postFonts.body,
          padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {!photo && fields.bg3d === "1" && (
          <Background3D
            width={width}
            height={height}
            bg={c.background}
            line={hexToRgba(c.divider, 0.9)}
            accentA={c.logoTile}
            accentB={c.title}
          />
        )}
        {imgSrc && (
          <>
            <img ref={imgRef} src={imgSrc} alt="" style={{ ...photoBox, objectFit: "fill", maxWidth: "none" }} />
            {/* Tint over the photo only (not the transparent area around it) so the rows stay readable - color under Colors (Photo overlay). */}
            <div style={{ ...photoBox, background: hexToRgba(c.overlay, overlay) }} />
          </>
        )}

        {/* Heading - position: relative keeps it (and the rows and logo) above the photo layers */}
        <div style={{ position: "relative", textAlign: "center" }}>
          <h1
            style={
              {
                margin: 0,
                // Photo variants: extra room on the title's right (0 = the normal centered title).
                ...(titleRight > 0 ? { marginRight: titleRight } : {}),
                fontFamily: englishFont ?? postFonts.display,
                fontWeight: englishFont ? 700 : 800,
                fontSize: titleSize,
                lineHeight: englishFont ? 1.15 : 1.05,
                // Bricolage's tight tracking - other fonts look cramped with it.
                letterSpacing: englishFont ? "normal" : "-0.03em",
                color: c.title,
                textWrap: "balance",
              } as CSSProperties
            }
          >
            {fields.title}
          </h1>
          {fields.subtitle && (
            <p
              lang="si"
              style={{
                margin: `18px ${subtitleRight}px 0 0`,
                fontFamily: sinhalaFont,
                fontWeight: 600,
                fontSize: tall ? 46 : 40,
                lineHeight: 1.4,
                color: c.subtitle,
              }}
            >
              {fields.subtitle}
            </p>
          )}
        </div>

        {/* Rows - one grid so columns align; position: relative so it's the cells' offsetParent for the fit */}
        <div
          ref={listRef}
          style={{
            margin: `${tall ? 56 : 40}px ${tableRight}px 0 ${tableLeft}px`,
            flex: 1,
            minHeight: 0,
            position: "relative",
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            alignContent: "space-evenly",
          }}
        >
          {items.map((it, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ ...cell(i, false, Math.max(0, -lineDiff)), gap: s(4) }}>
                <div
                  style={{
                    ...(englishFont ? { fontFamily: englishFont } : {}),
                    fontWeight: pct(fields.wordWeight, 600, 300, 800),
                    fontSize: s(size.word),
                    lineHeight: WORD_LH,
                    color: c.word,
                  }}
                >
                  {hl(it.word)}
                </div>
                {it.pron && (
                  <div
                    lang="si"
                    style={{
                      fontFamily: sinhalaFont,
                      fontWeight: pct(fields.pronWeight, 500, 400, 800),
                      fontSize: s(size.pron),
                      lineHeight: 1.35,
                      color: c.pronunciation,
                    }}
                  >
                    {photo ? hl(`(${it.pron})`) : <>({it.pron})</>}
                  </div>
                )}
              </div>
              <div
                lang="si"
                style={{
                  ...cell(i, true, Math.max(0, lineDiff)),
                  justifyContent: "flex-start",
                  fontFamily: sinhalaFont,
                  // Bolder by default on the photo variants, where the meaning sits on a picture.
                  fontWeight: pct(fields.meaningWeight, photo ? 700 : 500, 400, 800),
                  fontSize: s(size.meaning),
                  lineHeight: MEANING_LH,
                  color: c.meaning,
                }}
              >
                {photo ? <div>{hl(it.meaning)}</div> : it.meaning}
              </div>
            </div>
          ))}
        </div>

        {/* Logo - in the flow under the rows; the photo variants place it anywhere with the sliders instead */}
        {photo ? (
          <>
            {/* Keep the logo's old row free under the words, so the default bottom spot never covers the last row */}
            <div style={{ flex: "none", height: (tall ? 44 : 30) + logoSize }} />
            <div
              style={{
                position: "absolute",
                inset: LOGO_MARGIN,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  ...logoRow(logoSize),
                  position: "absolute",
                  left: `${logoX}%`,
                  top: `${logoY}%`,
                  transform: `translate(-${logoX}%, -${logoY}%)`,
                }}
              >
                <StudyPalLogo size={logoSize} tile={c.logoTile} ink={c.logoInk} />
                {fields.brand && <span style={brandText(logoSize, c.brand)}>{fields.brand}</span>}
              </div>
            </div>
          </>
        ) : (
          <div
            style={{
              position: "relative",
              marginTop: tall ? 44 : 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 18,
            }}
          >
            <StudyPalLogo size={logoSize} tile={c.logoTile} ink={c.logoInk} />
            {fields.brand && (
              <span
                style={{
                  fontFamily: postFonts.display,
                  fontWeight: 700,
                  fontSize: tall ? 44 : 38,
                  letterSpacing: "-0.01em",
                  color: c.brand,
                }}
              >
                {fields.brand}
              </span>
            )}
          </div>
        )}
      </div>
    );
  };
}

const defaultFields = {
  title: "Beauty Products in English",
  subtitle: "රූපලාවණ්‍ය අයිතමයන් English වලින්",
  brand: "StudyPal",
};

const defaultItems = [
  { word: "Nail Polish", pron: "නේල් පොලිෂ්", meaning: "නිය ආලේපනය" },
  { word: "Lip Gloss", pron: "ලිප් ග්ලොස්", meaning: "තොල් දිලිසෙන ආලේපනය" },
  { word: "Foundation", pron: "ෆවුන්ඩේෂන්", meaning: "මූලික මේකප් ආලේපනය" },
  { word: "Concealer", pron: "කන්සීලර්", meaning: "කැළැල් වසන ආලේපනය" },
  { word: "Blush", pron: "බ්ලෂ්", meaning: "කම්මුල්වලට වර්ණය ලබාදෙන ආලේපනය" },
  { word: "Eyeliner", pron: "අයිලයිනර්", meaning: "ඇස් වටා අඳින ආලේපනය" },
  { word: "Mascara", pron: "මැස්කාරා", meaning: "ඇහිපියන් කළු කිරීමේ ආලේපනය" },
  { word: "Lip Balm", pron: "ලිප් බාම්", meaning: "තොල් ආරක්ෂක ආලේපනය" },
];

const defaultColors = {
  background: "#ececec",
  title: "#f26b5b",
  subtitle: "#2f5d62",
  word: "#1f1f1f",
  pronunciation: "#f26b5b",
  meaning: "#1f1f1f",
  divider: "#d6d6d6",
  logoTile: "#591f82",
  logoInk: "#f9b200",
  brand: "#591f82",
};

function makeVocab(
  id: string,
  name: string,
  description: string,
  width: number,
  height: number,
  maxItems: number,
  defaultTitleSize: number,
  rowSizes: { word: number; pron: number; meaning: number },
  photo = false,
): PostTemplateDef {
  const photoFields: PostFieldDef[] = photo
    ? [
        {
          key: "image",
          label: "Background photo",
          type: "image",
          hint: "Upload, paste a URL, or search free photos below. Empty = the plain background color.",
        },
        {
          key: "imageWidth",
          label: "Photo width",
          type: "range",
          min: 10,
          max: 300,
          step: 1,
          unit: "%",
          hint: "% of the post's width. 100 width + 100 height = fits the post exactly.",
        },
        {
          key: "imageHeight",
          label: "Photo height",
          type: "range",
          min: 10,
          max: 300,
          step: 1,
          unit: "%",
          hint: "% of the post's height. Change width and height together to keep the photo's shape.",
        },
        {
          key: "imageX",
          label: "Photo position - left / right",
          type: "range",
          min: 0,
          max: 100,
          unit: "%",
          hint: "0 = left edge, 50 = center, 100 = right edge (when the photo is narrower or wider than the post).",
        },
        {
          key: "imageY",
          label: "Photo position - up / down",
          type: "range",
          min: 0,
          max: 100,
          unit: "%",
          hint: "0 = top, 50 = middle, 100 = bottom.",
        },
        {
          key: "backgroundOpacity",
          label: "Background opacity",
          type: "range",
          min: 0,
          max: 100,
          unit: "%",
          hint: "0 = transparent (the exported PNG has no background around the photo), 100 = solid Background color.",
        },
        {
          key: "tableMarginLeft",
          label: "Word table - left margin",
          type: "range",
          min: 0,
          max: 300,
          unit: "px",
          hint: "Moves the English words in from the left edge (added to the normal margin).",
        },
        {
          key: "tableMarginRight",
          label: "Word table - right margin",
          type: "range",
          min: 0,
          max: 300,
          unit: "px",
          hint: "Keeps the meanings further from the right edge. If the rows get too narrow, the text shrinks to fit.",
        },
        {
          key: "textBgOpacity",
          label: "Text background opacity",
          type: "range",
          min: 0,
          max: 1,
          step: 0.001,
          hint: "A highlight behind each English word, pronunciation and meaning, so they read clearly on the photo. 0 = none, 1 = solid.",
        },
        { key: "textBgColor", label: "Text background color", type: "color", hint: "The highlight's color - white by default." },
        {
          key: "logoSize",
          label: "Logo size",
          type: "range",
          min: 30,
          max: 200,
          unit: "px",
          hint: "The StudyPal logo and its text together.",
        },
        {
          key: "logoX",
          label: "Logo position - left / right",
          type: "range",
          min: 0,
          max: 100,
          unit: "%",
          hint: "0 = left edge, 50 = center, 100 = right edge.",
        },
        {
          key: "logoY",
          label: "Logo position - up / down",
          type: "range",
          min: 0,
          max: 100,
          unit: "%",
          hint: "0 = top edge, 100 = bottom edge.",
        },
        {
          key: "photoTint",
          label: "Photo overlay",
          type: "range",
          min: 0,
          max: 100,
          unit: "%",
          hint: "0 = the photo shows clearly. Raise it only if the words are hard to read on a busy photo - it tints the photo with the Photo overlay color.",
        },
      ]
    : [];
  return {
    id,
    name,
    description,
    width,
    height,
    fields: [
      ...photoFields,
      ...(photo
        ? []
        : ([
            {
              key: "bg3d",
              label: "3D background",
              type: "checkbox",
              hint: "Adds lighting, a perspective floor grid and glossy spheres behind the words. Uses the Background, Row divider, Logo tile and Title colors.",
            },
          ] satisfies PostFieldDef[])),
      { key: "title", label: "Title", type: "textarea" },
      {
        key: "titleSize",
        label: "Title size",
        type: "range",
        min: 30,
        max: 200,
        step: 1,
        unit: "px",
        hint: `Default ${defaultTitleSize}px - bigger titles leave less room, so the rows shrink to fit`,
      },
      ...(photo
        ? [
            {
              key: "titleMarginRight",
              label: "Title - right margin",
              type: "range" as const,
              min: 0,
              max: 500,
              unit: "px",
              hint: "Keeps the title away from the right edge - e.g. to leave room for the logo in a top corner. A long title wraps onto more lines.",
            },
          ]
        : []),
      { key: "subtitle", label: "Subtitle", type: "textarea", lang: "si" },
      ...(photo
        ? [
            {
              key: "subtitleMarginRight",
              label: "Subtitle - right margin",
              type: "range" as const,
              min: 0,
              max: 500,
              unit: "px",
              hint: "Keeps the subtitle away from the right edge. A long subtitle wraps onto more lines.",
            },
          ]
        : []),
      {
        key: "items",
        label: "Words",
        type: "list",
        itemLabel: "Word",
        minItems: 1,
        maxItems,
        hint: "Rows spread out to fill the space",
        itemFields: [
          { key: "word", label: "English word", type: "text" },
          {
            key: "pron",
            label: "Pronunciation (Sinhala)",
            type: "text",
            lang: "si",
            hint: "Shown in brackets under the English word",
          },
          {
            key: "meaning",
            label: "Meaning (Sinhala)",
            type: "text",
            lang: "si",
          },
        ],
      },
      {
        key: "wordSize",
        label: "English word size",
        type: "range",
        min: 20,
        max: 120,
        step: 1,
        unit: "px",
        hint: `Default ${rowSizes.word}px`,
      },
      {
        key: "pronSize",
        label: "Pronunciation size",
        type: "range",
        min: 16,
        max: 100,
        step: 1,
        unit: "px",
        hint: `Default ${rowSizes.pron}px`,
      },
      {
        key: "meaningSize",
        label: "Meaning size",
        type: "range",
        min: 16,
        max: 100,
        step: 1,
        unit: "px",
        hint: `Default ${rowSizes.meaning}px - if the rows don't fit, all row text shrinks together until they do`,
      },
      {
        key: "englishFont",
        label: "English font",
        type: "select",
        options: englishFontChoices,
        hint: "For the title and the English words.",
      },
      {
        key: "wordWeight",
        label: "English word boldness",
        type: "range",
        min: 300,
        max: 800,
        step: 100,
        hint: "400 = regular, 600 = semi-bold (default), 700 = bold.",
      },
      {
        key: "sinhalaFont",
        label: "Sinhala font",
        type: "select",
        options: sinhalaFontChoices,
        hint: "For the subtitle, pronunciations and meanings.",
      },
      {
        key: "pronWeight",
        label: "Pronunciation boldness",
        type: "range",
        min: 400,
        max: 800,
        step: 100,
        hint: "400 = regular, 500 = default, 700 = bold.",
      },
      {
        key: "meaningWeight",
        label: "Meaning boldness",
        type: "range",
        min: 400,
        max: 800,
        step: 100,
        hint: `400 = regular, 600 = semi-bold, 700 = bold, 800 = extra bold. Default ${photo ? 700 : 500}.`,
      },
      {
        key: "columnGap",
        label: "Gap between word and meaning",
        type: "range",
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
        hint: "Default 56px",
      },
      {
        key: "brand",
        label: "Logo text",
        type: "text",
        hint: "Shown next to the StudyPal logo at the bottom - empty shows the logo alone",
      },
    ],
    colors: [
      { key: "background", label: "Background" },
      { key: "title", label: "Title" },
      { key: "subtitle", label: "Subtitle" },
      { key: "word", label: "English word" },
      { key: "pronunciation", label: "Pronunciation" },
      { key: "meaning", label: "Meaning" },
      { key: "divider", label: "Row divider" },
      { key: "logoTile", label: "Logo tile" },
      { key: "logoInk", label: "Logo mark" },
      { key: "brand", label: "Logo text" },
      ...(photo
        ? [
            { key: "overlay", label: "Photo overlay" },
          ]
        : []),
    ],
    defaultFields: {
      ...defaultFields,
      titleSize: String(defaultTitleSize),
      wordSize: String(rowSizes.word),
      pronSize: String(rowSizes.pron),
      meaningSize: String(rowSizes.meaning),
      meaningWeight: photo ? "700" : "500",
      sinhalaFont: "noto-sans",
      englishFont: "studypal",
      wordWeight: "600",
      pronWeight: "500",
      columnGap: "56",
      ...(photo
        ? {
            image: "",
            imageWidth: "100",
            imageHeight: "100",
            imageX: "50",
            imageY: "50",
            photoTint: "0",
            backgroundOpacity: "0",
            logoSize: String(height / width > 1.5 ? 72 : 60),
            logoX: "50",
            logoY: "100",
            tableMarginLeft: "0",
            tableMarginRight: "0",
            textBgOpacity: "0.9",
            textBgColor: "#ffffff",
            titleMarginRight: "0",
            subtitleMarginRight: "0",
          }
        : {}),
    },
    defaultLists: { items: defaultItems },
    // The overlay starts as the background color, so a 70% tint reads like the plain post with the photo showing through.
    defaultColors: photo ? { ...defaultColors, overlay: defaultColors.background } : defaultColors,
    colorsFromPalette: (p, variant) => {
      const bg = variant === "light" ? mixHex(p.background, p.primary, 0.06) : p.primary;
      const ink = variant === "light" ? p.foreground : "#ffffff";
      return {
        background: bg,
        title: variant === "light" ? p.primary : p.gold,
        subtitle: variant === "light" ? p.brand2 : mixHex("#ffffff", p.primary, 0.2),
        word: ink,
        pronunciation: variant === "light" ? p.brand2 : p.gold,
        meaning: ink,
        divider: mixHex(bg, ink, 0.15),
        logoTile: variant === "light" ? p.primary : p.gold,
        logoInk: variant === "light" ? p.gold : p.primary,
        brand: variant === "light" ? p.primary : "#ffffff",
        ...(photo ? { overlay: bg } : {}),
      };
    },
    suggestCaption: (f, l) =>
      [
        [f.title, f.subtitle].filter(Boolean).join("\n"),
        (l.items ?? [])
          .filter((it) => it.word)
          .map((it) => `${it.word}${it.pron ? ` (${it.pron})` : ""}${it.meaning ? ` - ${it.meaning}` : ""}`)
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    captionContext: (f, l) => ({
      format: "list",
      topic: f.title || null,
      items: (l.items ?? [])
        .filter((it) => it.word)
        .map((it) => ({
          english: it.word,
          sinhala: it.meaning || null,
          pronunciation: it.pron || null,
        })),
    }),
    transparentBackground: photo,
    loadFonts: loadPostFontsWithChoices,
    component: makeComponent(width, height, photo),
  };
}

export const studyPalVocabStory = makeVocab("studypal-vocab-story", "Vocab · Story 9:16", "1080×1920 · title, subtitle, word | pronunciation | meaning rows, logo", 1080, 1920, 16, 92, {
  word: 60,
  pron: 42,
  meaning: 42,
});
export const studyPalVocabFeed = makeVocab("studypal-vocab-feed", "Vocab · Feed 4:5", "1080×1350 · title, subtitle, word | pronunciation | meaning rows, logo", 1080, 1350, 12, 80, {
  word: 48,
  pron: 36,
  meaning: 36,
});
export const studyPalVocabPhotoStory = makeVocab(
  "studypal-vocab-photo-story",
  "Vocab Photo · Story 9:16",
  "1080×1920 · background photo, title, subtitle, word | meaning rows, logo",
  1080,
  1920,
  16,
  92,
  { word: 60, pron: 42, meaning: 42 },
  true,
);
export const studyPalVocabPhotoFeed = makeVocab(
  "studypal-vocab-photo-feed",
  "Vocab Photo · Feed 4:5",
  "1080×1350 · background photo, title, subtitle, word | meaning rows, logo",
  1080,
  1350,
  12,
  80,
  { word: 48, pron: 36, meaning: 36 },
  true,
);
