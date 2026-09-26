import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { hexToRgba, mixHex, resolvePostAsset, usePostHold } from "../PostReady";
import { useShrinkToFit } from "../useFitFontSize";
import { loadPostFonts, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostTemplateDef, PostTemplateProps } from "../types";

// Height of the photo band in image mode - the photo covers the top of the
// story behind the brand bar + heading and fades into the background colour
// before the list starts, so list text always sits on a solid field.
const PHOTO_HEIGHT = 1120;

/**
 * React port of post-templates/list-story-template.html - a 1080x1920 story
 * with a heading and a numbered list of any length (the `items` list field).
 * Every list dimension is multiplied by a CSS variable --s that
 * useShrinkToFit tunes: short lists grow up to 1.25x, long ones shrink down
 * to 0.4x until the list fits (hence maxItems 10 - more than that can't fit). The optional photo variant isn't in the HTML
 * mock - it's this port's addition, mirroring StudyPalQuote's image mode.
 */
function StudyPalListStory({ fields, lists, colors }: PostTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hold = usePostHold();

  const items = lists.items ?? [];
  const imgSrc = resolvePostAsset(fields.image ?? "");
  const hasImage = !!imgSrc;
  const c = colors;

  useShrinkToFit(
    listRef,
    (s) => rootRef.current?.style.setProperty("--s", String(s)),
    { max: 1.25, min: 0.4, step: 0.02 },
    [JSON.stringify(items), fields.title, fields.titleSi, fields.kicker, fields.footer, hasImage],
  );

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !imgSrc || img.complete) return;
    const release = hold("post: load image");
    img.addEventListener("load", release, { once: true });
    img.addEventListener("error", release, { once: true });
    return release;
  }, [imgSrc, hold]);

  const s = (px: number) => `calc(${px}px * var(--s))`;

  const root: CSSProperties = {
    width: 1080,
    height: 1920,
    position: "relative",
    overflow: "hidden",
    background: c.background,
    color: c.text,
    fontFamily: postFonts.body,
  };

  return (
    <div ref={rootRef} style={root}>
      {hasImage && (
        <>
          <img
            ref={imgRef}
            src={imgSrc}
            alt=""
            style={{ position: "absolute", top: 0, left: 0, width: "100%", height: PHOTO_HEIGHT, objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: PHOTO_HEIGHT + 2,
              // Clear photo behind the brand bar, then a steep fade so the
              // heading (from ~50% of the band down) sits on mostly-solid colour.
              background: `linear-gradient(180deg, ${hexToRgba(c.backgroundDeep, 0.72)} 0%, ${hexToRgba(c.backgroundDeep, 0)} 18%, ${hexToRgba(
                c.background,
                0,
              )} 28%, ${hexToRgba(c.background, 0.78)} 50%, ${hexToRgba(c.background, 0.94)} 68%, ${c.background} 100%)`,
            }}
          />
        </>
      )}

      <div
        style={{
          position: "relative",
          zIndex: 2,
          height: "100%",
          padding: "110px 80px 100px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <StudyPalLogo size={76} tile={c.accent} ink={c.background} />
          <span style={{ fontFamily: postFonts.display, fontWeight: 700, fontSize: 42, letterSpacing: "-0.01em" }}>{fields.brand}</span>
          {fields.kicker && (
            <span
              style={{
                marginLeft: "auto",
                padding: "14px 30px",
                borderRadius: 99,
                background: c.accent,
                color: c.onAccent,
                fontFamily: postFonts.display,
                fontWeight: 700,
                fontSize: 30,
              }}
            >
              {fields.kicker}
            </span>
          )}
        </div>

        {/* Heading - pushed down over the photo's faded lower half in image mode */}
        <div style={{ marginTop: hasImage ? 380 : 90 }}>
          <h1
            style={
              {
                margin: 0,
                fontFamily: postFonts.display,
                fontWeight: 800,
                fontSize: 96,
                lineHeight: 1.02,
                letterSpacing: "-0.035em",
                color: c.accent,
                textWrap: "balance",
                textShadow: hasImage ? `0 4px 24px ${hexToRgba(c.backgroundDeep, 0.55)}` : undefined,
              } as CSSProperties
            }
          >
            {fields.title}
          </h1>
          {fields.titleSi && (
            <p lang="si" style={{ margin: "22px 0 0", fontFamily: postFonts.sinhala, fontWeight: 600, fontSize: 42, lineHeight: 1.45 }}>
              {fields.titleSi}
            </p>
          )}
        </div>

        {/* List - position: relative so it's its items' offsetParent (the fit measures against it) */}
        <ol
          ref={listRef}
          style={{
            listStyle: "none",
            margin: "70px 0 0",
            padding: 0,
            flex: 1,
            minHeight: 0,
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-evenly",
          }}
        >
          {items.map((it, i) => (
            <li
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: `${s(84)} 1fr`,
                columnGap: s(34),
                alignItems: "start",
                padding: `${s(26)} 0`,
                borderTop: i > 0 ? `2px solid ${hexToRgba(c.text, 0.12)}` : undefined,
              }}
            >
              <span
                style={{
                  width: s(84),
                  height: s(84),
                  display: "grid",
                  placeItems: "center",
                  borderRadius: s(22),
                  background: c.accent,
                  color: c.onAccent,
                  fontFamily: postFonts.display,
                  fontWeight: 800,
                  fontSize: s(44),
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {i + 1}
              </span>
              <div>
                <div
                  style={{
                    fontFamily: postFonts.display,
                    fontWeight: 800,
                    fontSize: s(64),
                    lineHeight: 1.08,
                    letterSpacing: "-0.02em",
                    color: c.accent,
                    paddingTop: s(4),
                  }}
                >
                  {it.phrase}
                </div>
                {it.meaning && (
                  <div lang="si" style={{ marginTop: s(12), fontFamily: postFonts.sinhala, fontWeight: 500, fontSize: s(42), lineHeight: 1.45, color: c.text }}>
                    {it.meaning}
                  </div>
                )}
                {it.pron && (
                  <div
                    lang="si"
                    style={{
                      marginTop: s(6),
                      fontFamily: postFonts.sinhala,
                      fontStyle: "italic",
                      fontSize: s(34),
                      lineHeight: 1.45,
                      color: c.pronunciation,
                    }}
                  >
                    ({it.pron})
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>

        {/* Footer */}
        {fields.footer && (
          <div style={{ marginTop: 50, display: "flex", alignItems: "center", gap: 20, fontSize: 34, fontWeight: 600, color: c.mutedText }}>
            <span style={{ width: 72, height: 9, borderRadius: 5, background: c.accent, flex: "none" }} />
            {fields.footer}
          </div>
        )}
      </div>
    </div>
  );
}

export const studyPalListStory: PostTemplateDef = {
  id: "studypal-list-story",
  name: "StudyPal list story",
  description: "1080×1920 story · heading + numbered list (any length), optional photo",
  width: 1080,
  height: 1920,
  fields: [
    { key: "kicker", label: "Kicker (pill, top right)", type: "text", hint: "Empty hides the pill" },
    { key: "title", label: "Title", type: "textarea" },
    { key: "titleSi", label: "Sinhala title", type: "textarea", lang: "si" },
    {
      key: "items",
      label: "List",
      type: "list",
      itemLabel: "Item",
      minItems: 1,
      maxItems: 10,
      hint: "Items grow for short lists and shrink for long ones to fill the space",
      itemFields: [
        { key: "phrase", label: "Phrase", type: "text" },
        { key: "meaning", label: "Meaning (Sinhala)", type: "text", lang: "si" },
        { key: "pron", label: "Pronunciation (Sinhala)", type: "text", lang: "si", hint: "Shown in brackets" },
      ],
    },
    { key: "footer", label: "Footer", type: "text" },
    { key: "brand", label: "Brand name", type: "text" },
    { key: "image", label: "Top photo", type: "image", hint: "Optional - fills the top of the story behind the heading and fades into the background" },
  ],
  colors: [
    { key: "background", label: "Background" },
    { key: "backgroundDeep", label: "Background deep (photo shade)" },
    { key: "accent", label: "Accent (title, phrases, numbers)" },
    { key: "onAccent", label: "Text on accent" },
    { key: "text", label: "Text" },
    { key: "pronunciation", label: "Pronunciation" },
    { key: "mutedText", label: "Footer text" },
  ],
  defaultFields: {
    kicker: "Idioms",
    title: "5 English idioms you should know",
    titleSi: "දැනගත යුතුම ඉංග්‍රීසි යෙදුම් 5ක්",
    footer: "Follow StudyPal for daily English",
    brand: "StudyPal",
    image: "",
  },
  defaultLists: {
    items: [
      { phrase: "Break a leg", meaning: "සුභ පැතුම්! / ජය වේවා!", pron: "බ්‍රේක් අ ලෙග්" },
      { phrase: "Piece of cake", meaning: "හරිම ලේසි දෙයක්", pron: "පීස් ඔෆ් කේක්" },
      { phrase: "Hit the sack", meaning: "නිදාගන්න යනවා", pron: "හිට් ද සැක්" },
      { phrase: "Once in a blue moon", meaning: "ඉතා කලාතුරකින් / කලාතුරකින් සිදුවන දෙයක්", pron: "වන්ස් ඉන් අ බ්ලූ මූන්" },
      { phrase: "Under the weather", meaning: "අසනීපයෙන් / සනීප නැතිව", pron: "අන්ඩර් ද වෙදර්" },
    ],
  },
  defaultColors: {
    background: "#591f82",
    backgroundDeep: "#3b1259",
    accent: "#f9b200",
    onAccent: "#3b1259",
    text: "#ffffff",
    pronunciation: "#d3bde6",
    // rgba(255,255,255,.85) pre-blended over the purple, as in StudyPalQuote
    mutedText: "#e6ddec",
  },
  colorsFromPalette: (p, variant) => {
    if (variant === "light") {
      const deep = mixHex(p.primary, "#000000", 0.35);
      return {
        background: p.primary,
        backgroundDeep: deep,
        accent: p.gold,
        onAccent: deep,
        text: "#ffffff",
        pronunciation: mixHex("#ffffff", p.primary, 0.25),
        mutedText: mixHex("#ffffff", p.primary, 0.15),
      };
    }
    return {
      background: p.background,
      backgroundDeep: mixHex(p.background, "#000000", 0.4),
      accent: p.gold,
      onAccent: p.background,
      text: p.foreground,
      pronunciation: mixHex(p.primary, p.foreground, 0.45),
      mutedText: p.mutedForeground,
    };
  },
  loadFonts: loadPostFonts,
  component: StudyPalListStory,
};
