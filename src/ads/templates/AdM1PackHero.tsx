import { useRef } from "react";
import { resolvePostAsset } from "../../posts/PostReady";
import { AdFrame, BrandBar, MockupSlot, OfferBar, siLang, useAdFit, useImageStatus } from "../AdKit";
import { bookByNumber, PACKS, type AdBook } from "../products";
import type { AdTemplateDef, AdTemplateProps } from "../types";

// Port of ad-templates/ad-m1-pack-hero.html - "Template" CSS section, with
// the gold/purple literals turned into the --hi/--bg color slots and the
// JS-measured fan layout expressed in container-query units (same maths).
const CSS = `
.m1 .pack-name { margin: 60px 0 0; flex: none; font: 800 100px/1 var(--f-display); letter-spacing: -0.035em; color: var(--hi); }
.m1 .pack-name[lang] { font: 700 84px/1.4 var(--f-si); letter-spacing: normal; }
.m1 .pack-si { margin: 18px 0 0; flex: none; font: 700 50px/1.45 var(--f-si); color: #fff; }
.m1 .pack-si:not([lang]) { font-family: var(--f-display); line-height: 1.15; }
.m1 .pack-si:empty { display: none; }
.m1 .fan { position: relative; flex: 1; min-height: 540px; margin: 30px 0 26px; container-type: size; }
.m1 .fan .mockup-slot { position: absolute; }
.m1 .fan .fan-composite { inset: 0; }
.m1 .fan .fan-book { --ch: min(94cqh, 54cqw); bottom: 0; transform-origin: center bottom; }
.m1 .fan .fan-left { left: calc(50cqw - var(--ch) * .68053); width: calc(var(--ch) * .56); height: calc(var(--ch) * .84); transform: rotate(-9deg); z-index: 1; }
.m1 .fan .fan-right { left: calc(50cqw + var(--ch) * .12053); width: calc(var(--ch) * .56); height: calc(var(--ch) * .84); transform: rotate(9deg); z-index: 1; }
.m1 .fan .fan-center { left: calc(50cqw - var(--ch) / 3); width: calc(var(--ch) * 2 / 3); height: var(--ch); z-index: 3; }
.m1 .stat { flex: none; margin-bottom: 30px; font: 600 36px/1.3 var(--f-body); color: rgba(255,255,255,.92); }
.m1 .stat b { color: var(--hi); font-weight: 700; }

.ad.m1[data-format="SQ"] .pack-name { margin-top: 40px; font-size: 84px; }
.ad.m1[data-format="SQ"] .pack-si { margin-top: 10px; font-size: 42px; }
.ad.m1[data-format="SQ"] .fan { min-height: 380px; margin: 20px 0 18px; }
.ad.m1[data-format="SQ"] .stat { margin-bottom: 22px; font-size: 32px; }

.ad.m1[data-format="ST"] .pack-name { margin-top: 48px; font-size: 92px; }
.ad.m1[data-format="ST"] .fan { min-height: 600px; }
`;

/** "3,4,7" -> those books; anything short of 3 valid numbers -> the pack's own books. */
function packBooks(raw: string, fallback: number[]): AdBook[] {
  const nums = (raw ?? "")
    .split(/[\s,|]+/)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 10);
  return (nums.length >= 3 ? nums : fallback).slice(0, 3).map(bookByNumber);
}

function AdM1PackHero({ format, product, fields, colors, mockup }: AdTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  if (product.kind !== "pack") throw new Error("M1 advertises a pack");
  const p = product.pack;
  const books = packBooks(fields.books, p.books);
  const composite = useImageStatus(resolvePostAsset(fields.mockup));

  useAdFit(rootRef, [format, product.code, JSON.stringify(fields)]);

  // Fan order from the HTML: left = book 1, right = book 3, centre (on top) = book 2.
  const fan = [
    { cls: "fan-left", i: 0 },
    { cls: "fan-right", i: 2 },
    { cls: "fan-center", i: 1 },
  ];

  return (
    <AdFrame format={format} className="m1 purple" css={CSS} vars={{ "--bg": colors.bg, "--glow": colors.glow, "--hi": colors.hi }} rootRef={rootRef}>
      <BrandBar chip={fields.chip} />
      <div className="pack-name" {...siLang(fields.packName)} data-fit data-min="56">
        {fields.packName}
      </div>
      <div className="pack-si" {...siLang(fields.packNameSi)} data-fit data-min="32">
        {fields.packNameSi}
      </div>
      <div className="fan">
        {composite === "ok" ? (
          <MockupSlot className="mockup-slot fan-composite" src={fields.mockup} book={books[0]} adjust={mockup} />
        ) : composite === "loading" ? null : (
          fan.map(({ cls, i }) => <MockupSlot key={cls} className={`mockup-slot fan-book ${cls}`} src={fields[`mockup${i + 1}`] ?? ""} book={books[i]} tilt={false} />)
        )}
      </div>
      <div className="stat" data-fit data-min="26">
        {fields.statLine ? (
          <span {...siLang(fields.statLine)}>{fields.statLine}</span>
        ) : (
          <>
            <b>3 books</b> · {p.phrasesLabel} phrases · {p.volumes} volumes
          </>
        )}
      </div>
      <OfferBar price={fields.price} priceWas={fields.priceWas} saveBadge={fields.saveBadge} cta={fields.cta} />
    </AdFrame>
  );
}

export const adM1PackHero: AdTemplateDef = {
  id: "ad-m1-pack-hero",
  code: "M1",
  name: "M1 · Pack Hero",
  description: "A 3-book pack on StudyPal purple: pack name, a fanned stack of the covers, phrase count, price and saving.",
  funnel: "Cold",
  productKind: "pack",
  defaultProduct: PACKS[1].id,
  formats: ["PT", "ST", "SQ"],
  fields: [
    { key: "chip", label: "Corner chip", type: "text" },
    { key: "packName", label: "Pack name", type: "text", auto: (p) => (p.kind === "pack" ? p.pack.name : "") },
    { key: "packNameSi", label: "Sinhala line", type: "text", lang: "si", auto: (p) => (p.kind === "pack" ? p.pack.hook || p.pack.hookEn : "") },
    { key: "books", label: "Books in the fan", type: "text", auto: (p) => (p.kind === "pack" ? p.pack.books.join(", ") : ""), hint: "Three book numbers, left to right in reading order, e.g. 3, 4, 7." },
    {
      key: "statLine",
      label: "Stat line",
      type: "text",
      placeholder: (p) => (p.kind === "pack" ? `3 books · ${p.pack.phrasesLabel} phrases · ${p.pack.volumes} volumes` : ""),
    },
    { key: "price", label: "Price", type: "text", hint: "Empty hides the price chip." },
    { key: "priceWas", label: "Old price (struck through)", type: "text" },
    { key: "saveBadge", label: "Save badge", type: "text", hint: "Empty hides it." },
    { key: "cta", label: "Call to action", type: "text" },
    { key: "mockup", label: "Composite mockup (all 3 books)", type: "image", hint: "Recommended: one 3D image of the pack. Empty = the three books below, fanned." },
    { key: "mockup1", label: "Book 1 mockup (left)", type: "image", hint: "Only used without a composite. Empty = that book's flat cover." },
    { key: "mockup2", label: "Book 2 mockup (centre)", type: "image" },
    { key: "mockup3", label: "Book 3 mockup (right)", type: "image" },
  ],
  defaultFields: {
    chip: "3-book pack",
    packName: "",
    packNameSi: "",
    books: "",
    statLine: "",
    price: "Rs ____",
    priceWas: "Rs ____",
    saveBadge: "Save __%",
    cta: "Order now · studypal.store",
    mockup: "",
    mockup1: "",
    mockup2: "",
    mockup3: "",
  },
  colors: [
    { key: "bg", label: "Background" },
    { key: "glow", label: "Background glow" },
    { key: "hi", label: "Highlight (pack name)" },
  ],
  colorsFor: () => ({ bg: "#591F82", glow: "#6E2A9E", hi: "#F9B200" }),
  backgroundColor: (c) => c.bg,
  component: AdM1PackHero,
};
