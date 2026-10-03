import { useRef } from "react";
import { AdFrame, BrandBar, MockupSlot, OfferBar, siLang, useAdFit } from "../AdKit";
import { offerDefaults, offerFields } from "../offerFields";
import type { AdTemplateDef, AdTemplateProps } from "../types";

// Port of ad-templates/ad-s2-peek-inside.html - "Template" CSS section verbatim.
const CSS = `
.ad.s2 { background: var(--tint); }
.s2 .brand-name { color: var(--deep); }
.s2 .chip { background: var(--surface); color: var(--accent); }

.s2 .situation { margin: 56px 0 0; flex: none; font: 800 64px/1.06 var(--f-display); letter-spacing: -0.03em; color: var(--deep); }
.s2 .situation[lang] { font: 700 56px/1.45 var(--f-si); }

.s2 .entry { flex: none; margin-top: 36px; background: var(--surface); border-radius: 24px; padding: 40px 44px 42px;
  border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
  box-shadow: 0 2px 4px rgba(27,33,64,.05), 0 24px 48px -24px rgba(27,33,64,.30); }
.s2 .row { display: grid; grid-template-columns: 52px 1fr; column-gap: 20px; align-items: start; }
.s2 .row + .row { margin-top: 18px; }
.s2 .ico { width: 52px; height: 52px; border-radius: 14px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--accent) 12%, #fff); color: var(--accent); }
.s2 .ico svg { width: 28px; height: 28px; }
.s2 .row--phrase .ico { background: var(--accent); color: #fff; }
.s2 .phrase { font: 800 60px/1.1 var(--f-display); letter-spacing: -0.02em; color: var(--accent); padding-top: 2px; }
.s2 .pron { font: italic 500 36px/1.5 var(--f-si); color: var(--muted); padding-top: 4px; }
.s2 .pron::before { content: "("; } .s2 .pron::after { content: ")"; }
.s2 .trans { font: 600 40px/1.5 var(--f-si); color: var(--ink); padding-top: 2px; }
.s2 .row:has(.pron:empty), .s2 .row:has(.trans:empty) { display: none; }

.s2 .more { flex: none; margin-top: 26px; display: flex; align-items: center; gap: 14px;
  font: 700 34px/1.2 var(--f-display); color: var(--accent); }
.s2 .more svg { width: 34px; height: 34px; flex: none; }
.s2 .more:has(span:empty) { display: none; }

.s2 .bottom { flex: 1; min-height: 360px; display: flex; gap: 40px; margin-top: 30px; }
.s2 .mockup-slot { width: 330px; flex: none; }
.s2 .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: flex-end; gap: 10px; padding-bottom: 6px; }
.s2 .title-si { font: 700 48px/1.45 var(--f-si); color: var(--deep); }
.s2 .title-en { font: 600 30px/1.25 var(--f-display); color: var(--ink-soft); }
.s2 .info .offer-bar { margin-top: 18px; }
.s2 .info .cta { margin-left: 0; width: 100%; color: var(--deep); }
.s2 .info .cta2 { text-align: left; }

.ad.s2[data-format="SQ"] .situation { margin-top: 40px; font-size: 54px; }
.ad.s2[data-format="SQ"] .entry { margin-top: 26px; padding: 30px 36px; }
.ad.s2[data-format="SQ"] .phrase { font-size: 52px; }
.ad.s2[data-format="SQ"] .more { margin-top: 18px; font-size: 30px; }
.ad.s2[data-format="SQ"] .bottom { min-height: 250px; margin-top: 22px; }
.ad.s2[data-format="SQ"] .mockup-slot { width: 230px; }
.ad.s2[data-format="SQ"] .title-si { font-size: 40px; }
.ad.s2[data-format="SQ"] .title-en { display: none; }
.ad.s2[data-format="SQ"] .price { font-size: 48px; }

.ad.s2[data-format="ST"] .situation { margin-top: 44px; font-size: 60px; }
.ad.s2[data-format="ST"] .entry { padding: 34px 34px 36px; }
.ad.s2[data-format="ST"] .phrase { font-size: 54px; }
.ad.s2[data-format="ST"] .bottom { flex-direction: column; gap: 22px; min-height: 520px; }
.ad.s2[data-format="ST"] .mockup-slot { width: 100%; flex: 1; }
.ad.s2[data-format="ST"] .info { flex: none; }
`;

const iconProps = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function AdS2PeekInside({ format, product, fields, colors, mockup }: AdTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  if (product.kind !== "book") throw new Error("S2 advertises a single book");
  const b = product.book;

  useAdFit(rootRef, [format, product.code, JSON.stringify(fields)]);

  return (
    <AdFrame format={format} className="s2" css={CSS} vars={{ "--accent": colors.accent, "--tint": colors.tint }} rootRef={rootRef}>
      <BrandBar chip={(b.n === 8 ? "18+ · " : "") + `Book ${b.n} / 10`} />
      <div className="situation" {...siLang(fields.situation)} data-fit data-min="40">
        {fields.situation}
      </div>
      <div className="entry">
        <div className="row row--phrase">
          <span className="ico">
            <svg {...iconProps}>
              <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
              <path d="M9 10h6M9 14h4" />
            </svg>
          </span>
          <div className="phrase" data-fit data-min="36">
            {fields.phrase}
          </div>
        </div>
        <div className="row">
          <span className="ico">
            <svg {...iconProps}>
              <path d="M11 5 6 9H3v6h3l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
            </svg>
          </span>
          <div className="pron" lang="si" data-fit data-min="26">
            {fields.pronunciation}
          </div>
        </div>
        <div className="row">
          <span className="ico">
            <svg {...iconProps}>
              <path d="M4 5h8M8 3v2M10 5c-.7 3.8-3 6.8-6 8.5M6 9c1 2 2.8 3.7 5 4.6" />
              <path d="m13 21 4-9 4 9M14.5 18h5" />
            </svg>
          </span>
          <div className="trans" lang="si" data-fit data-min="28">
            {fields.translation}
          </div>
        </div>
      </div>
      <div className="more">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M6 13l6 6 6-6" />
        </svg>
        <span {...siLang(fields.moreLine)}>{fields.moreLine}</span>
      </div>
      <div className="bottom">
        <MockupSlot src={fields.mockup} book={b} tilt adjust={mockup} />
        <div className="info">
          <div className="title-si" lang="si" data-fit data-min="30">
            {b.si}
          </div>
          <div className="title-en">{b.en + (b.enSub ? `: ${b.enSub}` : "")}</div>
          <OfferBar fields={fields} cta={fields.cta} cta2={fields.cta2} />
        </div>
      </div>
    </AdFrame>
  );
}

export const adS2PeekInside: AdTemplateDef = {
  id: "ad-s2-peek-inside",
  code: "S2",
  name: "S2 · Peek Inside",
  description: "One real entry from the book (phrase, Sinhala pronunciation, meaning) next to the mockup.",
  funnel: "Cold / Warm",
  productKind: "book",
  defaultProduct: "B02",
  formats: ["PT", "ST", "SQ"],
  fields: [
    { key: "situation", label: "Situation", type: "text", hint: "When you'd say it, e.g. \"What to say at the visa interview\"." },
    { key: "phrase", label: "Phrase", type: "text", hint: "Paste the entry verbatim from the book database - short, relatable, 10 words or fewer." },
    { key: "pronunciation", label: "Pronunciation (Sinhala)", type: "text", lang: "si", hint: "Parentheses are added by the design. Empty hides the row." },
    { key: "translation", label: "Translation (Sinhala)", type: "text", lang: "si", hint: "Empty hides the row." },
    { key: "moreLine", label: "\"More like this\" line", type: "text", auto: (p) => (p.kind === "book" ? `One of ${p.book.phrasesLabel} phrases in this book` : "") },
    { key: "price", label: "Price", type: "text", hint: "Empty hides the price chip." },
    ...offerFields,
    { key: "priceWas", label: "Old price (struck through)", type: "text" },
    { key: "cta", label: "Call to action", type: "text" },
    { key: "cta2", label: "Second call to action (below it)", type: "text", hint: "e.g. a second WhatsApp number. Empty hides it." },
    { key: "mockup", label: "Mockup", type: "image", hint: "Transparent PNG of this book. Empty = the flat cover with a 3D tilt." },
  ],
  defaultFields: {
    situation: "When something is really easy",
    phrase: "Piece of cake",
    pronunciation: "පීස් ඔෆ් කේක්",
    translation: "හරිම ලේසි දෙයක්",
    moreLine: "",
    price: "Rs ____",
    ...offerDefaults,
    priceWas: "",
    cta: "Order now · studypal.store",
    cta2: "",
    mockup: "",
  },
  colors: [
    { key: "accent", label: "Accent" },
    { key: "tint", label: "Tint (background)" },
  ],
  colorsFor: (p) => (p.kind === "book" ? { accent: p.book.accent, tint: p.book.tint } : { accent: "#591F82", tint: "#F4ECFA" }),
  backgroundColor: (c) => c.tint,
  component: AdS2PeekInside,
};
