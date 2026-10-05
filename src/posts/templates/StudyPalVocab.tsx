import { useRef, type CSSProperties } from "react";
import { mixHex } from "../PostReady";
import { useShrinkToFit } from "../useFitFontSize";
import { loadPostFonts, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * Vocabulary table (gui /vocab-post): a title, a Sinhala subtitle, then one
 * row per word - English word | (pronunciation) | Sinhala meaning - with the
 * StudyPal logo at the bottom. Rows sit in a single grid so the three columns
 * line up. Row text uses the px sizes set in the form; every row dimension
 * is multiplied by --s, which useShrinkToFit lowers only if the rows would
 * overflow, so the sizes are exact whenever they fit. One
 * component, two sizes (9:16 story and 4:5 feed) - see makeVocab.
 */
function makeComponent(width: number, height: number) {
  return function StudyPalVocab({ fields, lists, colors, insets }: PostTemplateProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const items = (lists.items ?? []).filter((it) => it.word || it.pron || it.meaning);
    const c = colors;
    const tall = height / width > 1.5;
    const titleSize = Number(fields.titleSize) || (tall ? 92 : 80);
    const size = { word: Number(fields.wordSize) || 50, pron: Number(fields.pronSize) || 36, meaning: Number(fields.meaningSize) || 36 };

    const pad = {
      top: Math.max(tall ? 120 : 80, insets.top),
      right: Math.max(64, insets.right),
      bottom: Math.max(tall ? 90 : 60, insets.bottom),
      left: Math.max(64, insets.left),
    };

    useShrinkToFit(
      listRef,
      (s) => rootRef.current?.style.setProperty("--s", String(s)),
      { max: 1, min: 0.3, step: 0.02 },
      [JSON.stringify(items), fields.title, fields.titleSize, fields.wordSize, fields.pronSize, fields.meaningSize, fields.subtitle, fields.brand, JSON.stringify(insets)],
    );

    const s = (px: number) => `calc(${px}px * var(--s))`;
    const divider = `2px solid ${c.divider}`;
    // No column gap - the gutter is padding on the first two cells, so each row's divider runs unbroken across all three.
    const cell = (i: number, last = false): CSSProperties => ({
      padding: `${s(20)} ${last ? "0" : s(26)} ${s(20)} 0`,
      borderTop: i > 0 ? divider : undefined,
      alignSelf: "stretch",
      display: "flex",
      alignItems: "center",
    });

    return (
      <div
        ref={rootRef}
        style={{
          width,
          height,
          position: "relative",
          overflow: "hidden",
          background: c.background,
          fontFamily: postFonts.body,
          padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Heading */}
        <div style={{ textAlign: "center" }}>
          <h1
            style={
              {
                margin: 0,
                fontFamily: postFonts.display,
                fontWeight: 800,
                fontSize: titleSize,
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
                color: c.title,
                textWrap: "balance",
              } as CSSProperties
            }
          >
            {fields.title}
          </h1>
          {fields.subtitle && (
            <p lang="si" style={{ margin: "18px 0 0", fontFamily: postFonts.sinhala, fontWeight: 600, fontSize: tall ? 46 : 40, lineHeight: 1.4, color: c.subtitle }}>
              {fields.subtitle}
            </p>
          )}
        </div>

        {/* Rows - one grid so columns align; position: relative so it's the cells' offsetParent for the fit */}
        <div
          ref={listRef}
          style={{
            margin: `${tall ? 56 : 40}px 0 0`,
            flex: 1,
            minHeight: 0,
            position: "relative",
            display: "grid",
            gridTemplateColumns: "auto auto 1fr",
            alignContent: "space-evenly",
          }}
        >
          {items.map((it, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ ...cell(i), fontWeight: 600, fontSize: s(size.word), lineHeight: 1.15, color: c.word }}>{it.word}</div>
              <div lang="si" style={{ ...cell(i), fontFamily: postFonts.sinhala, fontWeight: 500, fontSize: s(size.pron), lineHeight: 1.35, color: c.pronunciation }}>
                {it.pron ? `(${it.pron})` : ""}
              </div>
              <div lang="si" style={{ ...cell(i, true), fontFamily: postFonts.sinhala, fontWeight: 500, fontSize: s(size.meaning), lineHeight: 1.35, color: c.meaning }}>
                {it.meaning}
              </div>
            </div>
          ))}
        </div>

        {/* Logo */}
        <div style={{ marginTop: tall ? 44 : 30, display: "flex", alignItems: "center", justifyContent: "center", gap: 18 }}>
          <StudyPalLogo size={tall ? 72 : 60} tile={c.logoTile} ink={c.logoInk} />
          {fields.brand && (
            <span style={{ fontFamily: postFonts.display, fontWeight: 700, fontSize: tall ? 44 : 38, letterSpacing: "-0.01em", color: c.brand }}>{fields.brand}</span>
          )}
        </div>
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
): PostTemplateDef {
  return {
    id,
    name,
    description,
    width,
    height,
    fields: [
      { key: "title", label: "Title", type: "textarea" },
      { key: "titleSize", label: "Title size", type: "range", min: 30, max: 200, step: 1, unit: "px", hint: `Default ${defaultTitleSize}px - bigger titles leave less room, so the rows shrink to fit` },
      { key: "subtitle", label: "Subtitle", type: "textarea", lang: "si" },
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
          { key: "pron", label: "Pronunciation (Sinhala)", type: "text", lang: "si", hint: "Shown in brackets" },
          { key: "meaning", label: "Meaning (Sinhala)", type: "text", lang: "si" },
        ],
      },
      { key: "wordSize", label: "English word size", type: "range", min: 20, max: 120, step: 1, unit: "px", hint: `Default ${rowSizes.word}px` },
      { key: "pronSize", label: "Pronunciation size", type: "range", min: 16, max: 100, step: 1, unit: "px", hint: `Default ${rowSizes.pron}px` },
      { key: "meaningSize", label: "Meaning size", type: "range", min: 16, max: 100, step: 1, unit: "px", hint: `Default ${rowSizes.meaning}px - if the rows don't fit, all row text shrinks together until they do` },
      { key: "brand", label: "Logo text", type: "text", hint: "Shown next to the StudyPal logo at the bottom - empty shows the logo alone" },
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
    ],
    defaultFields: {
      ...defaultFields,
      titleSize: String(defaultTitleSize),
      wordSize: String(rowSizes.word),
      pronSize: String(rowSizes.pron),
      meaningSize: String(rowSizes.meaning),
    },
    defaultLists: { items: defaultItems },
    defaultColors,
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
      items: (l.items ?? []).filter((it) => it.word).map((it) => ({ english: it.word, sinhala: it.meaning || null, pronunciation: it.pron || null })),
    }),
    loadFonts: loadPostFonts,
    component: makeComponent(width, height),
  };
}

export const studyPalVocabStory = makeVocab("studypal-vocab-story", "Vocab · Story 9:16", "1080×1920 · title, subtitle, word | pronunciation | meaning rows, logo", 1080, 1920, 16, 92, { word: 60, pron: 42, meaning: 42 });
export const studyPalVocabFeed = makeVocab("studypal-vocab-feed", "Vocab · Feed 4:5", "1080×1350 · title, subtitle, word | pronunciation | meaning rows, logo", 1080, 1350, 12, 80, { word: 48, pron: 36, meaning: 36 });
