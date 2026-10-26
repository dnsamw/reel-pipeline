import { useRef, type CSSProperties } from "react";
import { hexToRgba } from "../PostReady";
import { useShrinkToFit } from "../useFitFontSize";
import { englishFontChoices, englishFontFamily, loadPostFontsWithChoices, postFonts, sinhalaFontChoices, sinhalaFontFamily } from "../fonts";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * Questions vs Answers (gui /qna-post, under English): two bordered, shadowed
 * heading pills with a "VS" bolt between them, then two columns split by a
 * vertical line - bulleted questions on the left, answers on the right, one
 * row each so every answer sits level with its question. Optional title and
 * footer line. No logo, so the rows get the whole post. The "meaning"
 * variants (gui /qna-meaning-post, under Posts) add a Sinhala meaning line
 * under every question and answer.
 * Row text uses the px sizes from the form, multiplied by --s, which
 * useShrinkToFit lowers only if the rows overflow. Two sizes (9:16, 4:5).
 */

function VsMark({ size, text, bolt, outline }: { size: string; text: string; bolt: string; outline: string }) {
  return (
    <svg viewBox="0 0 60 100" style={{ width: `calc(${size} * 0.6)`, height: size, overflow: "visible" }}>
      {/* Lightning bolt behind the letters */}
      <path d="M44 2 L24 46 L36 46 L14 98 L30 50 L18 50 Z" fill={bolt} />
      <text
        x="30"
        y="62"
        textAnchor="middle"
        fontFamily={postFonts.display}
        fontWeight={800}
        fontStyle="italic"
        fontSize="34"
        fill={text}
        stroke={outline}
        strokeWidth="2.5"
        paintOrder="stroke"
      >
        VS
      </text>
    </svg>
  );
}

function makeComponent(width: number, height: number, meaning: boolean) {
  return function StudyPalQnA({ fields, lists, colors: c, insets }: PostTemplateProps) {
    const boxRef = useRef<HTMLDivElement>(null);
    const num = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
    const tall = height / width > 1.5;

    const rows = (lists.items ?? []).filter((it) => it.left?.trim() || it.right?.trim());
    const font = englishFontFamily(fields.englishFont) ?? postFonts.body;
    const titleSize = num(fields.titleSize, tall ? 72 : 60, 24, 160);
    const headerSize = num(fields.headerSize, tall ? 64 : 54, 20, 120);
    const leftSize = num(fields.leftSize, tall ? 44 : 38, 16, 100);
    const rightSize = num(fields.rightSize, tall ? 44 : 38, 16, 100);
    const weight = num(fields.textWeight, 500, 300, 800);
    const rowGap = num(fields.rowGap, tall ? 34 : 22, 0, 120);
    const dividerWidth = num(fields.dividerWidth, 5, 0, 20);
    const bullets = fields.bullets !== "";
    // On: long text continues on the next line at full size. Off: every row stays on one line, and the rows shrink if one is too long.
    // Key renamed from wrapText so drafts saved with the old off-by-default pick up the meaning page's new default (on).
    const wrap = (fields.wrapLines ?? (meaning ? "1" : "")) === "1";
    const fill = fields.fillPage !== "";
    const showVs = fields.vs !== "";
    const footerSize = num(fields.footerSize, 30, 14, 60);
    // Meaning variants only: the Sinhala line under each question / answer.
    const meaningSize = num(fields.meaningSize, tall ? 32 : 26, 14, 80);
    const meaningWeight = num(fields.meaningWeight, 600, 400, 800);
    const sinFont = sinhalaFontFamily(fields.sinhalaFont);

    const pad = {
      top: Math.max(tall ? 90 : 56, insets.top),
      right: Math.max(48, insets.right),
      bottom: Math.max(tall ? 70 : 44, insets.bottom),
      left: Math.max(48, insets.left),
    };
    const colLeft = Math.max(num(fields.columnsLeft, 140, 0, 500), insets.left) - pad.left;
    const colRight = Math.max(num(fields.columnsRight, 140, 0, 500), insets.right) - pad.right;

    useShrinkToFit(
      boxRef,
      (s) => boxRef.current?.style.setProperty("--s", String(s)),
      {
        // Never grows past the sizes set in the form (so the sliders always do what they say);
        // "Fill the page" only spreads the rows out, it doesn't change the text size.
        max: 1,
        min: 0.3,
        step: 0.02,
        // One-line rows and heading pills can be too wide for their column - shrink for that too.
        alsoOver: () =>
          Array.from(boxRef.current?.querySelectorAll<HTMLElement>("[data-fit-x]") ?? []).some((el) => el.scrollWidth > el.clientWidth + 1) ||
          Array.from(boxRef.current?.querySelectorAll<HTMLElement>("[data-fit-y]") ?? []).some((el) => el.scrollHeight > el.clientHeight + 1),
      },
      [JSON.stringify(rows), wrap, fill, titleSize, headerSize, leftSize, rightSize, weight, rowGap, fields.englishFont, fields.title, fields.leftHeader, fields.rightHeader, colLeft, colRight, fields.footer, footerSize, meaningSize, meaningWeight, fields.sinhalaFont, JSON.stringify(insets)],
    );

    const s = (px: number) => `calc(${px}px * var(--s))`;
    const validColor = (v: string | undefined, fallback: string) => (v && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v.trim()) ? v.trim() : fallback);
    const pill = (label: string | undefined, bg: string, offset: number, column: number) =>
      label?.trim() ? (
        <div
          data-fit-x
          style={{
            gridColumn: column,
            overflow: "hidden",
            gridRow: 1,
            justifySelf: "center",
            alignSelf: "center",
            width: "92%",
            boxSizing: "border-box",
            transform: offset ? `translateX(${offset}px)` : undefined,
            background: bg,
            color: c.headerText,
            border: `${s(5)} solid ${c.headerBorder}`,
            borderRadius: s(headerSize * 0.42),
            boxShadow: `0 ${s(12)} ${s(18)} ${hexToRgba("#000000", 0.28)}`,
            fontFamily: font,
            fontWeight: 700,
            fontSize: s(headerSize),
            lineHeight: 1.25,
            padding: `${s(headerSize * 0.12)} ${s(headerSize * 0.4)}`,
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </div>
      ) : null;
    // One question or answer: its English line (with an optional bullet) and, on the meaning variants, its Sinhala line under it.
    const cell = (column: number, row: number, text: string | undefined, meaningText: string | undefined, size: number, color: string, meaningColor: string, bullet: boolean) => (
      <div data-fit-x style={{ gridColumn: column, gridRow: row, minWidth: 0, overflow: "hidden", whiteSpace: wrap ? "normal" : "nowrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", fontFamily: font, fontWeight: weight, fontSize: s(size), lineHeight: 1.3, color }}>
          {bullet && <span style={{ flex: "none", width: s(size * 0.9), color: c.bullet }}>•</span>}
          <span style={{ minWidth: 0, overflowWrap: "break-word" }}>{text}</span>
        </div>
        {meaning && meaningText?.trim() && (
          <div
            lang="si"
            style={{
              fontFamily: sinFont,
              fontWeight: meaningWeight,
              fontSize: s(meaningSize),
              lineHeight: 1.35,
              color: meaningColor,
              // Lines up with the English text, not the bullet.
              paddingLeft: bullet ? s(size * 0.9) : 0,
              marginTop: s(2),
              overflowWrap: "break-word",
            }}
          >
            {meaningText}
          </div>
        )}
      </div>
    );
    const hasHeaders = !!(fields.leftHeader?.trim() || fields.rightHeader?.trim());
    const firstRow = hasHeaders ? 3 : 1;

    return (
      <div
        style={{
          width,
          height,
          position: "relative",
          overflow: "hidden",
          background: c.bg,
          boxSizing: "border-box",
          padding: `${pad.top}px ${pad.right}px ${pad.bottom}px ${pad.left}px`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Everything shrinks together if it doesn't fit. */}
        <div ref={boxRef} style={{ "--s": 1, flex: "1 1 0", minHeight: 0, position: "relative", display: "flex", flexDirection: "column" } as CSSProperties}>
          {fields.title?.trim() && (
            <div style={{ flex: "none", fontFamily: font, fontWeight: 800, fontSize: s(titleSize), lineHeight: 1.15, color: c.title, textAlign: "center", marginBottom: s(titleSize * 0.5), textWrap: "balance" } as CSSProperties}>
              {fields.title}
            </div>
          )}
          {/* Fill: the rows block takes all the free height and spreads its rows over it. Off: it sits centered at its own height. */}
          <div data-fit-y style={fill ? { flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column" } : { flex: "none", margin: "auto 0" }}>
            <div
              style={{
                ...(fill ? { flex: "1 0 auto", alignContent: "space-evenly" } : {}),
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
                columnGap: s(56),
                rowGap: s(rowGap),
                alignItems: "start",
                margin: `0 ${colRight}px 0 ${colLeft}px`,
              }}
            >
              {hasHeaders && (
                <>
                  {pill(fields.leftHeader, c.leftHeaderBg, num(fields.leftHeaderX, 0, -400, 400), 1)}
                  <div style={{ gridColumn: 2, gridRow: 1, alignSelf: "center", justifySelf: "center", display: "flex" }}>
                    {showVs && <VsMark size={s(headerSize * 1.8)} text={c.vsText} bolt={c.vsBolt} outline={c.headerBorder} />}
                  </div>
                  {pill(fields.rightHeader, c.rightHeaderBg, num(fields.rightHeaderX, 0, -400, 400), 3)}
                  {/* Space under the pills, before the first row (its own grid row, plus the row gaps either side) */}
                  <div style={{ gridColumn: "1 / -1", gridRow: 2, height: s(headerSize * 0.3) }} />
                </>
              )}
              {/* Vertical line between the columns, spanning every row */}
              {dividerWidth > 0 && rows.length > 0 && (
                <div style={{ gridColumn: 2, gridRow: `${firstRow} / span ${rows.length}`, justifySelf: "center", width: dividerWidth, height: "100%", background: c.divider }} />
              )}
              {rows.map((it, i) => (
                <div key={i} style={{ display: "contents" }}>
                  {cell(1, firstRow + i, it.left, it.leftMeaning, leftSize, validColor(it.leftColor, c.left), c.leftMeaning, bullets)}
                  {cell(3, firstRow + i, it.right, it.rightMeaning, rightSize, validColor(it.rightColor, c.right), c.rightMeaning, false)}
                </div>
              ))}
            </div>
          </div>
          {fields.footer?.trim() && (
            <div style={{ flex: "none", marginTop: s(40), fontFamily: font, fontWeight: 600, fontSize: s(footerSize), color: c.footer, textAlign: "center" }}>{fields.footer}</div>
          )}
        </div>

      </div>
    );
  };
}

const defaultRows: [string, string][] = [
  ["Hello!", "Hi!"],
  ["How are you?", "I'm fine."],
  ["What's your name?", "My name is Nimal."],
  ["Where do you live?", "I live in Sri Lanka."],
  ["How old are you?", "I'm 22 years old."],
  ["What do you do?", "I'm a student."],
  ["Are you busy?", "No, I'm free."],
  ["Can I come in?", "Yes, please."],
  ["Do you speak English?", "A little."],
  ["What time is it?", "It's 6 PM."],
  ["Are you okay?", "Yes, I'm okay."],
  ["Is this your bag?", "Yes, it is."],
  ["Do you like tea?", "Yes, I do."],
  ["Are you ready?", "I'm ready."],
  ["Let's go!", "Okay, let's go."],
  ["Good night!", "Good night."],
];

// [question, its meaning, answer, its meaning] - fewer rows than the plain version, since each takes two lines.
const defaultMeaningRows: [string, string, string, string][] = [
  ["Hello!", "ආයුබෝවන්!", "Hi!", "හායි!"],
  ["How are you?", "ඔයාට කොහොමද?", "I'm fine.", "මට හොඳයි."],
  ["What's your name?", "ඔයාගේ නම මොකක්ද?", "My name is Nimal.", "මගේ නම නිමල්."],
  ["Where do you live?", "ඔයා ජීවත් වෙන්නේ කොහෙද?", "I live in Sri Lanka.", "මම ජීවත් වෙන්නේ ලංකාවේ."],
  ["How old are you?", "ඔයාගේ වයස කීයද?", "I'm 22 years old.", "මට අවුරුදු 22යි."],
  ["What do you do?", "ඔයා මොකක්ද කරන්නේ?", "I'm a student.", "මම ශිෂ්‍යයෙක්."],
  ["Are you busy?", "ඔයා කාර්යබහුලද?", "No, I'm free.", "නෑ, මම නිදහස්."],
  ["Can I come in?", "මට ඇතුළට එන්න පුළුවන්ද?", "Yes, please.", "ඔව්, එන්න."],
  ["Do you speak English?", "ඔයා ඉංග්‍රීසි කතා කරනවද?", "A little.", "ටිකක්."],
  ["What time is it?", "වෙලාව කීයද?", "It's 6 PM.", "හවස 6යි."],
];

function makeQnA(id: string, name: string, description: string, width: number, height: number, meaning = false): PostTemplateDef {
  const tall = height / width > 1.5;
  return {
    id,
    name,
    description,
    width,
    height,
    fields: [
      { key: "title", label: "Title", type: "textarea", hint: "Optional - empty hides it." },
      { key: "titleSize", label: "Title size", type: "range", min: 24, max: 160, unit: "px" },
      { key: "leftHeader", label: "Left heading", type: "text", hint: "Both headings empty = no heading row." },
      { key: "rightHeader", label: "Right heading", type: "text" },
      { key: "headerSize", label: "Heading size", type: "range", min: 20, max: 120, unit: "px" },
      { key: "leftHeaderX", label: "Left heading position - left / right", type: "range", min: -400, max: 400, unit: "px", hint: "0 = centered over its column." },
      { key: "rightHeaderX", label: "Right heading position - left / right", type: "range", min: -400, max: 400, unit: "px" },
      { key: "vs", label: "VS mark between the headings", type: "checkbox" },
      {
        key: "items",
        label: "Rows",
        type: "list",
        itemLabel: "Row",
        minItems: 1,
        maxItems: 24,
        hint: "Empty row colors use the Left text / Right text colors (Colors card). Rows shrink together if they don't fit.",
        itemFields: [
          { key: "left", label: "Question (left)", type: "text" },
          ...(meaning ? ([{ key: "leftMeaning", label: "Question meaning (Sinhala)", type: "text", lang: "si" }] as const) : []),
          { key: "right", label: "Answer (right)", type: "text" },
          ...(meaning ? ([{ key: "rightMeaning", label: "Answer meaning (Sinhala)", type: "text", lang: "si" }] as const) : []),
          { key: "leftColor", label: "Left text color", type: "color" },
          { key: "rightColor", label: "Right text color", type: "color" },
        ],
      },
      { key: "leftSize", label: "English text size - questions (left)", type: "range", min: 16, max: 100, unit: "px" },
      { key: "rightSize", label: "English text size - answers (right)", type: "range", min: 16, max: 100, unit: "px", hint: "If a line gets too long for its column, all the text shrinks a little so it fits." },
      ...(meaning
        ? ([
            { key: "meaningSize", label: "Meaning size", type: "range", min: 14, max: 80, unit: "px", hint: "The Sinhala line under each sentence." },
            { key: "sinhalaFont", label: "Sinhala font", type: "select", options: sinhalaFontChoices },
            { key: "meaningWeight", label: "Meaning boldness", type: "range", min: 400, max: 800, step: 100, hint: "400 = regular, 600 = default, 700 = bold." },
          ] satisfies PostTemplateDef["fields"])
        : []),
      { key: "fillPage", label: "Fill the page", type: "checkbox", hint: "On = rows spread out to use the whole height. Off = rows sit together in the middle." },
      { key: "rowGap", label: "Space between rows", type: "range", min: 0, max: 120, unit: "px", hint: "The smallest gap - with Fill the page on, rows spread further apart if there's room." },
      { key: "englishFont", label: "Font", type: "select", options: englishFontChoices, hint: "For the title, headings, rows and footer." },
      { key: "textWeight", label: "Row text boldness", type: "range", min: 300, max: 800, step: 100, hint: "400 = regular, 500 = default, 700 = bold." },
      { key: "bullets", label: "Bullets before the questions", type: "checkbox" },
      { key: "wrapLines", label: "Let long text wrap onto the next line", type: "checkbox", hint: "On = a long sentence continues on the next line and the text keeps its size. Off = every row stays on one line, and all rows shrink a little if one is too long." },
      { key: "dividerWidth", label: "Middle line thickness", type: "range", min: 0, max: 20, unit: "px", hint: "0 = no line." },
      { key: "columnsLeft", label: "Left margin", type: "range", min: 0, max: 500, unit: "px", hint: "Space from the post's left edge to the left column." },
      { key: "columnsRight", label: "Right margin", type: "range", min: 0, max: 500, unit: "px", hint: "Space from the right column to the post's right edge." },
      { key: "footer", label: "Footer text", type: "text", hint: "Small line at the bottom. Empty hides it." },
      { key: "footerSize", label: "Footer size", type: "range", min: 14, max: 60, unit: "px" },
    ],
    colors: [
      { key: "bg", label: "Background" },
      { key: "title", label: "Title" },
      { key: "leftHeaderBg", label: "Left heading box" },
      { key: "rightHeaderBg", label: "Right heading box" },
      { key: "headerText", label: "Heading text" },
      { key: "headerBorder", label: "Heading border" },
      { key: "vsText", label: "VS letters" },
      { key: "vsBolt", label: "VS bolt" },
      { key: "left", label: "Left text" },
      { key: "bullet", label: "Bullets" },
      { key: "divider", label: "Middle line" },
      { key: "right", label: "Right text" },
      ...(meaning
        ? [
            { key: "leftMeaning", label: "Question meanings" },
            { key: "rightMeaning", label: "Answer meanings" },
          ]
        : []),
      { key: "footer", label: "Footer text" },
    ],
    defaultFields: {
      title: "",
      titleSize: tall ? "72" : "60",
      leftHeader: "Questions",
      rightHeader: "Answers",
      headerSize: tall ? "64" : "54",
      leftHeaderX: "0",
      rightHeaderX: "0",
      vs: "1",
      leftSize: tall ? "44" : "38",
      rightSize: tall ? "44" : "38",
      rowGap: tall ? "34" : "22",
      fillPage: "1",
      englishFont: "open-sans",
      textWeight: "500",
      bullets: "1",
      wrapLines: meaning ? "1" : "",
      dividerWidth: "5",
      columnsLeft: "70",
      columnsRight: "70",
      footer: "",
      footerSize: "30",
      ...(meaning ? { meaningSize: tall ? "32" : "26", sinhalaFont: "noto-sans", meaningWeight: "600" } : {}),
    },
    defaultLists: {
      items: meaning
        ? defaultMeaningRows.map(([left, leftMeaning, right, rightMeaning]) => ({ left, leftMeaning, right, rightMeaning, leftColor: "", rightColor: "" }))
        : defaultRows.map(([left, right]) => ({ left, right, leftColor: "", rightColor: "" })),
    },
    // The original post's colors: white page, red questions, black answers, red / green heading pills.
    defaultColors: {
      bg: "#FFFFFF",
      title: "#111111",
      leftHeaderBg: "#F01414",
      rightHeaderBg: "#14BF5A",
      headerText: "#FFFFFF",
      headerBorder: "#111111",
      vsText: "#F5B800",
      vsBolt: "#E01B1B",
      left: "#E01B1B",
      bullet: "#E01B1B",
      divider: "#111111",
      right: "#111111",
      footer: "#8A8A8A",
      // Meaning variants: a softer shade of each column's own color.
      ...(meaning ? { leftMeaning: "#B23A3A", rightMeaning: "#555555" } : {}),
    },
    colorsFromPalette: (p, variant) =>
      variant === "dark"
        ? { bg: p.primary, title: "#FFFFFF", leftHeaderBg: p.gold, rightHeaderBg: "#14BF5A", headerText: "#FFFFFF", headerBorder: "#111111", vsText: p.gold, vsBolt: "#E01B1B", left: p.gold, bullet: p.gold, divider: "#FFFFFF", right: "#FFFFFF", footer: "#BBBBBB", ...(meaning ? { leftMeaning: "#F3E3B0", rightMeaning: "#DDDDDD" } : {}) }
        : { bg: "#FFFFFF", title: p.primary, leftHeaderBg: p.primary, rightHeaderBg: "#14BF5A", headerText: "#FFFFFF", headerBorder: "#111111", vsText: p.gold, vsBolt: p.primary, left: p.primary, bullet: p.primary, divider: "#111111", right: "#111111", footer: "#8A8A8A", ...(meaning ? { leftMeaning: "#555555", rightMeaning: "#555555" } : {}) },
    suggestCaption: (f, l) =>
      [
        f.title?.trim() || [f.leftHeader?.trim(), f.rightHeader?.trim()].filter(Boolean).join(" vs "),
        (l.items ?? [])
          .filter((it) => it.left?.trim() || it.right?.trim())
          .map((it) => {
            const line = (mark: string, text?: string, mean?: string) => (text?.trim() ? `${mark} ${text.trim()}${meaning && mean?.trim() ? ` (${mean.trim()})` : ""}` : "");
            return [line("❓", it.left, it.leftMeaning), line("✅", it.right, it.rightMeaning)].filter(Boolean).join("\n");
          })
          .join("\n\n"),
      ]
        .filter(Boolean)
        .join("\n\n"),
    captionContext: (f, l) => ({
      format: "list",
      topic: f.title || [f.leftHeader, f.rightHeader].filter(Boolean).join(" vs ") || null,
      items: (l.items ?? [])
        .filter((it) => it.left?.trim() || it.right?.trim())
        .map((it) => ({
          english: [it.left?.trim(), it.right?.trim()].filter(Boolean).join(" - "),
          sinhala: meaning ? [it.leftMeaning?.trim(), it.rightMeaning?.trim()].filter(Boolean).join(" - ") || null : null,
          pronunciation: null,
        })),
    }),
    loadFonts: loadPostFontsWithChoices,
    component: makeComponent(width, height, meaning),
  };
}

export const studyPalQnAStory = makeQnA("studypal-qna-story", "Questions vs Answers · Story 9:16", "1080×1920 · heading pills with VS, questions | answers split by a line", 1080, 1920);
export const studyPalQnAFeed = makeQnA("studypal-qna-feed", "Questions vs Answers · Feed 4:5", "1080×1350 · heading pills with VS, questions | answers split by a line", 1080, 1350);
export const studyPalQnAMeaningStory = makeQnA("studypal-qna-meaning-story", "Q&A with Meaning · Story 9:16", "1080×1920 · questions | answers, each with its Sinhala meaning", 1080, 1920, true);
export const studyPalQnAMeaningFeed = makeQnA("studypal-qna-meaning-feed", "Q&A with Meaning · Feed 4:5", "1080×1350 · questions | answers, each with its Sinhala meaning", 1080, 1350, true);
