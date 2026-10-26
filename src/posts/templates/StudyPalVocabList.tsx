import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { hexToRgba, resolvePostAsset, usePostHold } from "../PostReady";
import { useShrinkToFit } from "../useFitFontSize";
import { loadPostFonts, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * Picture vocabulary list (gui /vocab-list-post): a title, a Sinhala
 * subtitle, then one row per word - its own photo on the left, and on the
 * right "1. Word", the pronunciation and the Sinhala meaning - divided by thin
 * lines, with the StudyPal logo at the bottom. Row sizes are the px values set
 * in the form, multiplied by --s, which useShrinkToFit lowers only if the rows
 * would overflow. One component, two sizes (9:16 story and 4:5 feed).
 */

function RowPhoto({ src, aspect, radius, placeholder }: { src: string; aspect: number; radius: number; placeholder: string }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const hold = usePostHold();
  const resolved = resolvePostAsset(src);

  // Block a render capture until the photo is decoded - otherwise renderStill can capture an empty <img>.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !resolved || img.complete) return;
    const release = hold("post: load row image");
    img.addEventListener("load", release, { once: true });
    img.addEventListener("error", release, { once: true });
    return release;
  }, [resolved, hold]);

  const box: CSSProperties = {
    // As tall as its row; the width follows from the aspect, capped so the text always keeps room.
    flex: "none",
    height: "100%",
    aspectRatio: String(aspect),
    maxWidth: "50%",
    borderRadius: radius,
    overflow: "hidden",
    background: placeholder,
  };
  return (
    <div style={box}>
      {resolved && <img ref={imgRef} src={resolved} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
    </div>
  );
}

function makeComponent(width: number, height: number) {
  return function StudyPalVocabList({ fields, lists, colors: c, insets }: PostTemplateProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const num = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));

    const items = (lists.items ?? []).filter((it) => it.word?.trim() || it.pron?.trim() || it.meaning?.trim() || it.image?.trim());
    const titleSize = num(fields.titleSize, 56, 24, 120);
    const subtitleSize = num(fields.subtitleSize, 34, 16, 80);
    const wordSize = num(fields.wordSize, 46, 20, 100);
    // Drafts saved before the split had one lineSize for both lines - it stays the starting point.
    const pronSize = num(fields.pronSize || fields.lineSize, 38, 16, 90);
    const meaningSize = num(fields.meaningSize || fields.lineSize, 38, 16, 90);
    // Photo width as a % of its height - the height is always the row's.
    const photoWidth = num(fields.photoWidth, 85, 50, 160);
    const rowGap = num(fields.rowGap, 16, 0, 60);
    const logoSize = num(fields.logoSize, height / width > 1.5 ? 64 : 56, 30, 160);

    const padX = Math.max(64, insets.left, insets.right);
    const padTop = Math.max(72, insets.top + 24);
    const padBottom = Math.max(48, insets.bottom + 24);

    useShrinkToFit(
      listRef,
      (s) => listRef.current?.style.setProperty("--s", String(s)),
      {
        max: 1,
        min: 0.3,
        step: 0.02,
        // Rows share the height equally, so text taller than its row overflows inside the row, not the list.
        alsoOver: () => Array.from(listRef.current?.querySelectorAll<HTMLElement>("[data-row-text]") ?? []).some((el) => el.scrollHeight > el.clientHeight + 1),
      },
      [JSON.stringify(items), wordSize, pronSize, meaningSize, photoWidth, rowGap, titleSize, subtitleSize, fields.title, fields.subtitle, insets.top, insets.bottom],
    );

    const text = (size: number, color: string, font: string, weight: number): CSSProperties => ({
      fontFamily: font,
      fontWeight: weight,
      fontSize: `calc(${size}px * var(--s))`,
      lineHeight: 1.35,
      color,
      overflowWrap: "break-word",
    });

    return (
      <div
        style={{
          width,
          height,
          position: "relative",
          overflow: "hidden",
          background: c.bg,
          display: "flex",
          flexDirection: "column",
          padding: `${padTop}px ${padX}px ${padBottom}px`,
          boxSizing: "border-box",
        }}
      >
        {/* Everything above the logo shrinks together, so the header and rows keep their proportions. */}
        <div ref={listRef} style={{ "--s": 1, flex: "1 1 0", minHeight: 0, position: "relative", display: "flex", flexDirection: "column" } as CSSProperties}>
          {fields.title?.trim() && (
            <div style={{ ...text(titleSize, c.title, postFonts.display, 700), lineHeight: 1.2, marginBottom: `calc(${titleSize * 0.3}px * var(--s))` }}>{fields.title}</div>
          )}
          {fields.subtitle?.trim() && (
            <div lang="si" style={{ ...text(subtitleSize, c.subtitle, postFonts.sinhala, 500), whiteSpace: "pre-line" }}>
              {fields.subtitle}
            </div>
          )}
          {/* Rows split the remaining height equally - each photo fills its row's height, so there's no empty band. */}
          <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column", marginTop: `calc(${subtitleSize * 0.6}px * var(--s))` }}>
            {items.map((it, i) => (
              <div
                key={i}
                style={{
                  flex: "1 1 0",
                  minHeight: 0,
                  display: "flex",
                  alignItems: "stretch",
                  gap: 28,
                  padding: `${rowGap / 2}px 0`,
                  borderBottom: i < items.length - 1 ? `2px solid ${c.divider}` : "none",
                }}
              >
                <RowPhoto src={it.image ?? ""} aspect={photoWidth / 100} radius={18} placeholder={hexToRgba(c.word, 0.08)} />
                <div data-row-text style={{ flex: "1 1 0", minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", gap: `calc(${Math.max(pronSize, meaningSize) * 0.3}px * var(--s))` }}>
                  {it.word?.trim() && (
                    <div style={{ ...text(wordSize, c.word, postFonts.display, 700), lineHeight: 1.2 }}>
                      {fields.numbered !== "0" ? `${i + 1}. ` : ""}
                      {it.word}
                    </div>
                  )}
                  {it.pron?.trim() && (
                    <div lang="si" style={{ ...text(pronSize, c.pron, postFonts.sinhala, 500) }}>
                      ({it.pron.trim()})
                    </div>
                  )}
                  {it.meaning?.trim() && (
                    <div lang="si" style={{ ...text(meaningSize, c.meaning, postFonts.sinhala, 600) }}>
                      {it.meaning}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ flex: "none", display: "flex", justifyContent: "center", alignItems: "center", gap: logoSize * 0.25, marginTop: 28 }}>
          <StudyPalLogo size={logoSize} tile={c.brandTile} ink={c.brandInk} />
          {fields.brand?.trim() && (
            <span style={{ fontFamily: postFonts.display, fontWeight: 700, fontSize: logoSize * 0.61, color: c.brandText, whiteSpace: "nowrap" }}>{fields.brand}</span>
          )}
        </div>
      </div>
    );
  };
}

function makeVocabList(id: string, name: string, description: string, width: number, height: number): PostTemplateDef {
  return {
    id,
    name,
    description,
    width,
    height,
    fields: [
      { key: "title", label: "Title", type: "textarea", hint: "Also the topic for Generate from title." },
      { key: "titleSize", label: "Title size", type: "range", min: 24, max: 120, unit: "px" },
      { key: "subtitle", label: "Subtitle (Sinhala)", type: "textarea", lang: "si", hint: "Empty hides it." },
      { key: "subtitleSize", label: "Subtitle size", type: "range", min: 16, max: 80, unit: "px" },
      {
        key: "items",
        label: "Words",
        type: "list",
        itemLabel: "Word",
        minItems: 1,
        maxItems: 10,
        hint: "Each word has its own photo. Rows shrink together if they don't fit.",
        itemFields: [
          { key: "word", label: "English word", type: "text" },
          { key: "pron", label: "Pronunciation (Sinhala)", type: "text", lang: "si" },
          { key: "meaning", label: "Meaning (Sinhala)", type: "text", lang: "si" },
          { key: "image", label: "Photo", type: "image", hint: "Upload, paste a URL, or search free photos. Cropped to fill the box." },
        ],
      },
      { key: "numbered", label: "Number the words (1 = on, 0 = off)", type: "range", min: 0, max: 1, step: 1 },
      { key: "photoWidth", label: "Photo width", type: "range", min: 50, max: 160, unit: "%", hint: "% of the photo's height. The height always fills the row." },
      { key: "rowGap", label: "Space between rows", type: "range", min: 0, max: 60, unit: "px" },
      { key: "wordSize", label: "Word size", type: "range", min: 20, max: 100, unit: "px" },
      { key: "pronSize", label: "Pronunciation size", type: "range", min: 16, max: 90, unit: "px" },
      { key: "meaningSize", label: "Meaning size", type: "range", min: 16, max: 90, unit: "px" },
      { key: "brand", label: "Name next to the logo", type: "text", hint: "Empty = the logo only." },
      { key: "logoSize", label: "Logo size", type: "range", min: 30, max: 160, unit: "px" },
    ],
    colors: [
      { key: "bg", label: "Background" },
      { key: "title", label: "Title" },
      { key: "subtitle", label: "Subtitle" },
      { key: "word", label: "Word" },
      { key: "pron", label: "Pronunciation" },
      { key: "meaning", label: "Meaning" },
      { key: "divider", label: "Divider lines" },
      { key: "brandTile", label: "Logo tile" },
      { key: "brandInk", label: "Logo mark" },
      { key: "brandText", label: "Logo name text" },
    ],
    defaultFields: {
      title: "Construction Site Vocabulary – English with Sinhala Meaning",
      titleSize: "56",
      subtitle: "මේ වචන ටික Construction Site එකක වැඩ කරන අයටත්, English ඉගෙනගන්න අයටත් ගොඩක් ප්‍රයෝජනවත්!",
      subtitleSize: "34",
      numbered: "1",
      photoWidth: "85",
      rowGap: "16",
      wordSize: "46",
      pronSize: "38",
      meaningSize: "38",
      brand: "StudyPal",
      logoSize: height / width > 1.5 ? "64" : "56",
    },
    defaultLists: {
      items: [
        { word: "Hard Hat", pron: "හාඩ් හැට්", meaning: "ආරක්ෂිත හිස්වැස්ම", image: "" },
        { word: "Safety Vest", pron: "සේෆ්ටි වෙස්ට්", meaning: "ආරක්ෂිත කබාය", image: "" },
        { word: "Ladder", pron: "ලැඩර්", meaning: "ඉණිමඟ", image: "" },
        { word: "Wheelbarrow", pron: "වීල්බැරෝ", meaning: "තල්ලු කරත්තය", image: "" },
        { word: "Cement", pron: "සිමෙන්ට්", meaning: "සිමෙන්ති", image: "" },
      ],
    },
    defaultColors: {
      bg: "#000000",
      title: "#FFFFFF",
      subtitle: "#FFFFFF",
      word: "#FFFFFF",
      pron: "#FFFFFF",
      meaning: "#FFFFFF",
      divider: "#262626",
      brandTile: "#F9B200",
      brandInk: "#591F82",
      brandText: "#FFFFFF",
    },
    colorsFromPalette: (p, variant) =>
      variant === "dark"
        ? { bg: "#000000", title: "#FFFFFF", subtitle: "#FFFFFF", word: "#FFFFFF", pron: "#FFFFFF", meaning: p.gold, divider: "#262626", brandTile: p.gold, brandInk: p.primary, brandText: "#FFFFFF" }
        : { bg: "#FFFFFF", title: p.primary, subtitle: "#333333", word: p.primary, pron: "#333333", meaning: "#111111", divider: "#E5E5E5", brandTile: p.gold, brandInk: p.primary, brandText: p.primary },
    suggestCaption: (f, l) =>
      [
        [f.title, f.subtitle].filter(Boolean).join("\n"),
        (l.items ?? [])
          .filter((it) => it.word)
          .map((it, i) => `${i + 1}. ${it.word}${it.pron ? ` (${it.pron})` : ""}${it.meaning ? ` - ${it.meaning}` : ""}`)
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    captionContext: (f, l) => ({
      format: "list",
      topic: f.title || null,
      items: (l.items ?? [])
        .filter((it) => it.word)
        .map((it) => ({ english: it.word, sinhala: it.meaning || null, pronunciation: it.pron || null })),
    }),
    loadFonts: loadPostFonts,
    component: makeComponent(width, height),
  };
}

export const studyPalVocabListStory = makeVocabList("studypal-vocab-list-story", "Vocab List · Story 9:16", "1080×1920 · one photo per word, with pronunciation and meaning", 1080, 1920);
export const studyPalVocabListFeed = makeVocabList("studypal-vocab-list-feed", "Vocab List · Feed 4:5", "1080×1350 · one photo per word, with pronunciation and meaning", 1080, 1350);
