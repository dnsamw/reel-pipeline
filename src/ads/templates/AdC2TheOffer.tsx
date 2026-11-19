import { useRef, type CSSProperties } from "react";
import { AdFrame, BrandBar, OfferBar, siLang, useAdFit } from "../AdKit";
import { BOOKS, COLLECTION, VALUE_LINE_SI } from "../products";
import { offerDefaults, offerFields } from "../offerFields";
import { fitSpineTitles } from "./AdC1TheShelf";
import type { AdTemplateDef, AdTemplateProps } from "../types";
import type { PostFields } from "../../posts/types";

// C1's shelf ad reworked after a pre-boost review (no HTML original): dark
// brand purple so every line clears contrast, the deadline in the corner
// chip, one sample entry as proof of the Sinhala-pronunciation USP, a calmer
// shelf (English names only), and trust badges that say what the buyer gets.
const CSS = `
.c2 .chip { font-size: 30px; padding: 8px 22px; border-color: var(--hi); }

.c2 .kicker { margin: 40px 0 0; flex: none; font: 700 40px/1.2 var(--f-display); letter-spacing: -0.01em; color: var(--hi); }
.c2 .kicker[lang] { font: 700 38px/1.45 var(--f-si); letter-spacing: normal; }
.c2 .big { margin: 4px 0 0; flex: none; font: 800 200px/.86 var(--f-display); letter-spacing: -0.05em; color: #fff; }
.c2 .value { margin: 22px 0 0; flex: none; font: 600 32px/1.5 var(--f-si); color: #fff; }
.c2 .value-en { margin: 6px 0 0; flex: none; font: 500 28px/1.3 var(--f-body); color: rgba(255,255,255,.78); }

/* One real entry from the books - shows the pronunciation idea instead of describing it. */
.c2 .sample { position: relative; flex: none; margin-top: 40px; padding: 30px 34px 24px; border-radius: 24px; background: #fff;
  box-shadow: 0 24px 40px -22px rgba(0,0,0,.55); }
.c2 .sample-tag { position: absolute; top: -20px; left: 28px; padding: 2px 18px; border-radius: 99px; background: var(--hi);
  color: var(--sp-purple-deep); font: 700 24px/1.5 var(--f-display); white-space: nowrap; }
.c2 .sample-tag[lang] { font: 700 23px/1.6 var(--f-si); }
.c2 .sample-en { font: 800 54px/1.1 var(--f-display); letter-spacing: -0.02em; color: var(--sp-purple); }
.c2 .sample-line { display: flex; flex-wrap: wrap; align-items: baseline; column-gap: 18px; margin-top: 6px; }
.c2 .sample-pron { font: italic 500 32px/1.5 var(--f-si); color: var(--muted); }
.c2 .sample-arrow { font: 700 32px/1 var(--f-display); color: var(--sp-purple-light); }
.c2 .sample-si { font: 700 36px/1.5 var(--f-si); color: var(--ink); }

.c2 .shelf-area { position: relative; flex: 1; min-height: 290px; margin: 32px 0 24px; container-type: size; }
.c2 .shelf { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: flex-end; }
.c2 .spines { display: flex; align-items: flex-end; gap: 8px; padding: 0 14px; }
.c2 .spine { flex: 1; min-width: 0; border-radius: 6px 6px 3px 3px; background: var(--s-accent); height: calc(92cqh - 22px);
  display: flex; flex-direction: column; align-items: center; padding: 12px 0; overflow: hidden;
  box-shadow: inset -6px 0 0 rgba(0,0,0,.16), inset 3px 0 0 rgba(255,255,255,.12); }
.c2 .spine-num { width: 38px; height: 38px; flex: none; border-radius: 50%; background: var(--s-tint); color: var(--s-accent);
  display: grid; place-items: center; font: 800 19px var(--f-display); }
.c2 .spine-title { flex: 1; min-height: 0; max-width: calc(100% - 10px); margin: 12px 0 2px; writing-mode: vertical-rl; transform: rotate(180deg);
  font: 700 26px/1 var(--f-display); color: var(--s-tint); white-space: nowrap; overflow: hidden; }
.c2 .spine-en { display: block; overflow: hidden; }
.c2 .plank { height: 22px; border-radius: 6px; background: var(--sp-purple-deep);
  box-shadow: inset 0 4px 0 var(--hi), 0 20px 30px -10px rgba(0,0,0,.55); }

/* What the buyer gets - the answer to "is this real, and how do I get it?". */
.c2 .trust { flex: none; display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 26px; }
.c2 .pill { display: inline-flex; align-items: center; gap: 10px; padding: 6px 20px 6px 12px; border-radius: 99px;
  background: rgba(255,255,255,.1); border: 2px solid rgba(255,255,255,.28); color: #fff; font: 600 28px/1.5 var(--f-body); white-space: nowrap; }
.c2 .pill[lang] { font: 600 27px/1.55 var(--f-si); }
.c2 .pill svg { width: 30px; height: 30px; flex: none; color: var(--hi); }

.c2 .price-volumes { margin-bottom: -2px; }
.c2 .cta { font-size: 36px; font-weight: 700; color: #fff; }

.ad.c2[data-format="SQ"] .kicker { margin-top: 26px; font-size: 34px; }
.ad.c2[data-format="SQ"] .big { font-size: 150px; }
.ad.c2[data-format="SQ"] .value, .ad.c2[data-format="SQ"] .value-en { display: none; }
.ad.c2[data-format="SQ"] .sample { margin-top: 34px; padding: 26px 30px 18px; }
.ad.c2[data-format="SQ"] .sample-en { font-size: 46px; }
.ad.c2[data-format="SQ"] .shelf-area { min-height: 170px; margin: 24px 0 18px; }
.ad.c2[data-format="SQ"] .trust { margin-bottom: 18px; }
/* Too short for readable names - the numbered spines alone still read as "ten books". */
.ad.c2[data-format="SQ"] .spine-title { visibility: hidden; }

/* LS 1.91:1 - two columns: the hook and proof on the left, the shelf over the offer on the right.
   The shelf spans the left column's top rows, so its height follows the text (it's a size container). */
.ad.c2[data-format="LS"] .ad-inner { display: grid; grid-template-columns: 1fr 520px; grid-template-rows: auto auto auto auto auto 1fr;
  column-gap: 44px; align-content: start; }
.ad.c2[data-format="LS"] .brand-bar { grid-column: 1 / -1; grid-row: 1; }
.ad.c2[data-format="LS"] .kicker { grid-column: 1; grid-row: 2; margin-top: 18px; font-size: 26px; }
.ad.c2[data-format="LS"] .big { grid-column: 1; grid-row: 3; margin-top: 0; font-size: 128px; }
.ad.c2[data-format="LS"] .value { grid-column: 1; grid-row: 4; margin-top: 12px; font-size: 22px; }
.ad.c2[data-format="LS"] .value-en { display: none; }
.ad.c2[data-format="LS"] .sample { grid-column: 1; grid-row: 5; margin-top: 30px; padding: 18px 22px 12px; border-radius: 18px; }
.ad.c2[data-format="LS"] .sample-tag { top: -16px; left: 18px; padding: 0 14px; font-size: 18px; }
.ad.c2[data-format="LS"] .sample-en { font-size: 34px; }
.ad.c2[data-format="LS"] .sample-line { column-gap: 12px; margin-top: 2px; }
.ad.c2[data-format="LS"] .sample-pron { font-size: 21px; }
.ad.c2[data-format="LS"] .sample-arrow { font-size: 21px; }
.ad.c2[data-format="LS"] .sample-si { font-size: 23px; }
.ad.c2[data-format="LS"] .trust { grid-column: 1; grid-row: 6; align-self: end; margin: 16px 0 0; gap: 8px; }
.ad.c2[data-format="LS"] .pill { font-size: 18px; padding: 3px 14px 3px 8px; gap: 7px; }
.ad.c2[data-format="LS"] .pill svg { width: 20px; height: 20px; }
.ad.c2[data-format="LS"] .shelf-area { grid-column: 2; grid-row: 2 / 5; min-height: 0; margin: 22px 0 0; }
.ad.c2[data-format="LS"] .spines { gap: 5px; padding: 0 8px; }
.ad.c2[data-format="LS"] .spine { padding: 8px 0; }
.ad.c2[data-format="LS"] .spine-num { width: 26px; height: 26px; font-size: 13px; }
.ad.c2[data-format="LS"] .spine-title { font-size: 17px; margin: 8px 0 2px; }
.ad.c2[data-format="LS"] .plank { height: 14px; box-shadow: inset 0 3px 0 var(--hi), 0 14px 20px -8px rgba(0,0,0,.55); }
.ad.c2[data-format="LS"] .offer-bar { grid-column: 2; grid-row: 5 / 8; align-self: end; margin-top: 18px; }
/* The offer is what this small crop has to sell - bigger than the shared LS sizes. */
.ad.c2[data-format="LS"] .price-volumes { font-size: 30px; }
.ad.c2[data-format="LS"] .price-chip { padding: 10px 22px; }
.ad.c2[data-format="LS"] .price { font-size: 52px; }
.ad.c2[data-format="LS"] .price-prefix { font-size: 28px; }
.ad.c2[data-format="LS"] .price-was { font-size: 24px; }
.ad.c2[data-format="LS"] .save-badge { font-size: 24px; }
.ad.c2[data-format="LS"] .cta { font-size: 30px; }

.ad.c2[data-format="ST"] .big { font-size: 170px; }
.ad.c2[data-format="ST"] .shelf-area { min-height: 300px; }
.ad.c2[data-format="ST"] .spines { gap: 6px; padding: 0 6px; }
.ad.c2[data-format="ST"] .spine-num { width: 32px; height: 32px; font-size: 16px; }
.ad.c2[data-format="ST"] .spine-title { font-size: 22px; }
`;

const CHECK = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="currentColor" />
    <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#3B1259" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function AdC2TheOffer({ format, fields, lists, colors }: AdTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const spines = lists.spines ?? [];
  const trust = [fields.trust1, fields.trust2, fields.trust3].map((t) => (t ?? "").trim()).filter(Boolean);

  useAdFit(rootRef, [format, JSON.stringify(fields), JSON.stringify(spines)], fitSpineTitles);

  return (
    <AdFrame format={format} className="c2 purple" css={CSS} vars={{ "--bg": colors.bg, "--glow": colors.glow, "--hi": colors.hi }} rootRef={rootRef}>
      <BrandBar chip={fields.chip} />
      {fields.kicker && (
        <div className="kicker" {...siLang(fields.kicker)} data-fit data-min="26">
          {fields.kicker}
        </div>
      )}
      <div className="big" data-fit data-min="110">
        {fields.bigNumber}
      </div>
      {fields.valueLine && (
        <div className="value" {...siLang(fields.valueLine)} data-fit data-min="24">
          {fields.valueLine}
        </div>
      )}
      {fields.valueLineEn && (
        <div className="value-en" {...siLang(fields.valueLineEn)} data-fit data-min="22">
          {fields.valueLineEn}
        </div>
      )}
      {fields.sampleEn && (
        <div className="sample">
          {fields.sampleTag && (
            <span className="sample-tag" {...siLang(fields.sampleTag)}>
              {fields.sampleTag}
            </span>
          )}
          <div className="sample-en" data-fit data-min="32">
            {fields.sampleEn}
          </div>
          <div className="sample-line">
            {fields.samplePron && (
              <span className="sample-pron" lang="si" data-fit data-min="22">
                {fields.samplePron}
              </span>
            )}
            {fields.samplePron && fields.sampleSi && <span className="sample-arrow">→</span>}
            {fields.sampleSi && (
              <span className="sample-si" lang="si" data-fit data-min="24">
                {fields.sampleSi}
              </span>
            )}
          </div>
        </div>
      )}
      <div className="shelf-area">
        <div className="shelf">
          <div className="spines">
            {BOOKS.map((b) => (
              <div key={b.n} className="spine" style={{ "--s-accent": b.accent, "--s-tint": b.tint } as CSSProperties}>
                <span className="spine-num">{b.n}</span>
                <span className="spine-title">
                  <span className="spine-en">{spines[b.n - 1]?.en ?? b.spine}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="plank" />
        </div>
      </div>
      {trust.length > 0 && (
        <div className="trust">
          {trust.map((t, i) => (
            <span key={i} className="pill" {...siLang(t)} data-fit data-min="20">
              {CHECK}
              {t}
            </span>
          ))}
        </div>
      )}
      <OfferBar fields={fields} saveBadge={fields.saveBadge} cta={fields.cta} cta2={fields.cta2} />
    </AdFrame>
  );
}

/** Primary text for Ads Manager / the boost, built from the ad's own fields (WhatsApp ordering, deadline). */
function c2PrimaryText(fields: PostFields): string {
  const lines = [
    "ඉංග්‍රීසියෙන් කතා කරන්න බයද? 😊",
    fields.valueLine || VALUE_LINE_SI,
    "",
    `✅ පොත් ${COLLECTION.books} · වෙළුම් ${COLLECTION.volumes} · වාක්‍ය ${COLLECTION.phrasesLabel}`,
    ...[fields.trust2, fields.trust3].map((t) => (t ?? "").trim()).filter(Boolean).map((t) => `✅ ${t}`),
  ];
  if (fields.sampleEn) lines.push(`✅ උදා: ${fields.sampleEn} ${fields.samplePron ?? ""} = ${fields.sampleSi ?? ""}`.replace(/\s+/g, " ").trim());
  const was = fields.priceWas ? `${fields.priceWas} → ` : "";
  lines.push("", `💰 ${was}${fields.price} පමණයි`);
  if (fields.chip?.trim()) lines.push(`⏰ ${fields.chip.trim()}`);
  for (const c of [fields.cta, fields.cta2]) if (c?.trim()) lines.push(`📲 ${c.trim()}`);
  return lines.join("\n");
}

export const adC2TheOffer: AdTemplateDef = {
  id: "ad-c2-the-offer",
  code: "C2",
  name: "C2 · The Offer",
  description:
    "The complete collection as a boost-ready offer: deadline chip, big phrase count, one sample entry as proof, the shelf, what-you-get badges, price and WhatsApp.",
  funnel: "Cold",
  productKind: "collection",
  defaultProduct: "ALL",
  formats: ["PT", "ST", "SQ", "LS"],
  fields: [
    { key: "chip", label: "Corner chip (deadline)", type: "text", lang: "si", hint: "e.g. the offer's end date. Empty hides it." },
    { key: "kicker", label: "Line above the big number", type: "text", lang: "si", hint: "Empty hides it." },
    { key: "bigNumber", label: "Big number", type: "text" },
    { key: "valueLine", label: "Value line", type: "textarea", lang: "si", hint: "Hidden on SQ. Empty hides it." },
    { key: "valueLineEn", label: "English line (under it)", type: "text", hint: "Hidden on SQ. Empty hides it." },
    { key: "sampleTag", label: "Sample label", type: "text", lang: "si" },
    { key: "sampleEn", label: "Sample phrase (English)", type: "text", hint: "Empty hides the whole sample card." },
    { key: "samplePron", label: "Sample pronunciation", type: "text", lang: "si" },
    { key: "sampleSi", label: "Sample meaning", type: "text", lang: "si" },
    { key: "trust1", label: "Badge 1", type: "text", lang: "si", hint: "What the buyer gets. Empty hides a badge." },
    { key: "trust2", label: "Badge 2", type: "text", lang: "si" },
    { key: "trust3", label: "Badge 3", type: "text", lang: "si" },
    { key: "price", label: "Price", type: "text", hint: "Empty hides the price chip." },
    ...offerFields,
    { key: "priceWas", label: "Old price (struck through)", type: "text", hint: "Only a price you've really sold at." },
    { key: "saveBadge", label: "Save badge", type: "text", hint: "Empty hides it." },
    { key: "cta", label: "Call to action", type: "text" },
    { key: "cta2", label: "Second call to action (below it)", type: "text", hint: "e.g. a second WhatsApp number. Empty hides it." },
    {
      key: "spines",
      label: "Shelf spines",
      type: "list",
      itemLabel: "Book",
      itemFields: [{ key: "en", label: "Name on the spine", type: "text" }],
      minItems: 10,
      maxItems: 10,
      fixed: true,
      hint: "Short English names - long ones shrink to fit their spine.",
    },
  ],
  defaultFields: {
    chip: "ඔක්. 8 දක්වා පමණයි",
    kicker: "වාක්‍ය රටා සහ උදාහරණ",
    bigNumber: COLLECTION.phrasesLabel,
    valueLine: VALUE_LINE_SI,
    valueLineEn: "English patterns & phrases for every situation.",
    sampleTag: "පොතේ ඇතුළේ",
    sampleEn: "Piece of cake",
    samplePron: "(පීස් ඔෆ් කේක්)",
    sampleSi: "හරිම ලේසි දෙයක්",
    trust1: `පොත් ${COLLECTION.books} · වෙළුම් ${COLLECTION.volumes}`,
    trust2: "PDF · WhatsApp එකෙන්ම ලැබේ",
    trust3: "",
    price: "Rs 1000",
    ...offerDefaults,
    volumesLine: "අදම ඇනවුම් කරන්න!",
    priceWas: "Rs 2500",
    saveBadge: "Save 60%",
    cta: "WhatsApp : 078 44 89 045",
    cta2: "",
  },
  defaultLists: {
    spines: BOOKS.map((b) => ({ en: b.spine })),
  },
  colors: [
    { key: "bg", label: "Background" },
    { key: "glow", label: "Background glow" },
    { key: "hi", label: "Highlight (chip, kicker, badges)" },
  ],
  colorsFor: () => ({ bg: "#591F82", glow: "#6E2A9E", hi: "#F9B200" }),
  backgroundColor: (c) => c.bg,
  suggestPrimaryText: (_product, fields) => c2PrimaryText(fields),
  component: AdC2TheOffer,
};
