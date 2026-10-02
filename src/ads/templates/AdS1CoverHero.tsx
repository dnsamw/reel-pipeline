import { useRef } from "react";
import { AdFrame, BrandBar, MockupSlot, OfferBar, siLang, useAdFit } from "../AdKit";
import type { AdTemplateDef, AdTemplateProps } from "../types";

// Port of ad-templates/ad-s1-cover-hero.html - "Template" CSS section verbatim.
const CSS = `
.ad.s1 { background: radial-gradient(circle at 74% 62%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 46%), var(--tint); }
.s1 .brand-name { color: var(--deep); }
.s1 .chip { background: var(--surface); color: var(--accent); }
.s1 .chip.is-adult { background: var(--deep); color: #fff; }

.s1 .hook-block { margin-top: 64px; flex: none; }
.s1 .hook { margin: 0; font: 700 88px/1.42 var(--f-si); color: var(--deep); }
.s1 .hook:not([lang]) { font-family: var(--f-display); font-weight: 800; line-height: 1.04; letter-spacing: -0.03em; }
.s1 .hook-en { margin: 12px 0 0; font: 700 42px/1.2 var(--f-display); color: var(--accent); letter-spacing: -0.01em; }
.s1 .hook-en:empty { display: none; }

.s1 .middle { flex: 1; min-height: 560px; display: flex; gap: 24px; margin: 36px 0 40px; }
.s1 .proof { flex: 1; display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.s1 .stat-number { font: 800 140px/.92 var(--f-display); letter-spacing: -0.04em; white-space: nowrap; color: var(--accent); }
.s1 .stat-label { margin-top: 10px; font: 600 36px/1.2 var(--f-body); color: var(--ink-soft); }
.s1 .bullets { list-style: none; margin: 44px 0 0; padding: 0; display: grid; gap: 22px; }
.s1 .bullets li { display: grid; grid-template-columns: 44px 1fr; gap: 16px; align-items: center;
  font: 600 32px/1.25 var(--f-body); color: var(--ink); }
.s1 .bullets li[lang] { font-family: var(--f-si); line-height: 1.5; }
.s1 .bullets li::before { content: ""; width: 44px; height: 44px; border-radius: 50%;
  background: var(--accent) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E") center / 26px no-repeat; }
.s1 .mockup-slot { width: 520px; flex: none; }

.s1 .cta { color: var(--deep); }

.ad.s1[data-format="SQ"] .hook-block { margin-top: 44px; }
.ad.s1[data-format="SQ"] .hook { font-size: 70px; }
.ad.s1[data-format="SQ"] .hook-en { font-size: 36px; }
.ad.s1[data-format="SQ"] .middle { min-height: 400px; margin: 24px 0 28px; }
.ad.s1[data-format="SQ"] .mockup-slot { width: 480px; }
.ad.s1[data-format="SQ"] .stat-number { font-size: 128px; }
.ad.s1[data-format="SQ"] .bullets { display: none; }

.ad.s1[data-format="ST"] .hook-block { margin-top: 48px; }
.ad.s1[data-format="ST"] .hook { font-size: 84px; }
.ad.s1[data-format="ST"] .middle { flex-direction: column; min-height: 640px; margin: 28px 0 32px; gap: 28px; }
.ad.s1[data-format="ST"] .mockup-slot { order: -1; width: 100%; flex: 1; }
.ad.s1[data-format="ST"] .proof { flex: none; flex-direction: row; align-items: baseline; justify-content: flex-start; gap: 20px; }
.ad.s1[data-format="ST"] .stat-number { font-size: 120px; }
.ad.s1[data-format="ST"] .stat-label { margin: 0; }
.ad.s1[data-format="ST"] .bullets { display: none; }
.ad.s1[data-format="ST"] .cta { margin-left: 0; width: 100%; }
`;

function AdS1CoverHero({ format, product, fields, lists, colors, mockup }: AdTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  if (product.kind !== "book") throw new Error("S1 advertises a single book");
  const b = product.book;
  const bullets = (lists.bullets ?? []).map((it) => it.text ?? "").filter(Boolean).slice(0, 3);

  useAdFit(rootRef, [format, product.code, JSON.stringify(fields), JSON.stringify(bullets)]);

  return (
    <AdFrame format={format} className="s1" css={CSS} vars={{ "--accent": colors.accent, "--tint": colors.tint }} rootRef={rootRef}>
      <BrandBar chip={b.n === 8 ? "18+ · Book 8 / 10" : `Book ${b.n} / 10`} chipClassName={b.n === 8 ? "is-adult" : undefined} />
      <div className="hook-block">
        <div className="hook" {...siLang(fields.hook)} data-fit data-min="48">
          {fields.hook}
        </div>
        <div className="hook-en" {...siLang(fields.hookEn)} data-fit data-min="28">
          {fields.hookEn}
        </div>
      </div>
      <div className="middle">
        <div className="proof">
          <div className="stat-number" data-fit data-min="80">
            {fields.statNumber}
          </div>
          <div className="stat-label" {...siLang(fields.statLabel)}>
            {fields.statLabel}
          </div>
          <ul className="bullets">
            {bullets.map((t, i) => (
              <li key={i} {...siLang(t)}>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <MockupSlot src={fields.mockup} book={b} tilt adjust={mockup} />
      </div>
      <OfferBar price={fields.price} priceWas={fields.priceWas} cta={fields.cta} />
    </AdFrame>
  );
}

export const adS1CoverHero: AdTemplateDef = {
  id: "ad-s1-cover-hero",
  code: "S1",
  name: "S1 · Cover Hero",
  description: "Big mockup, Sinhala hook, one proof number and the price. The workhorse single-book ad.",
  funnel: "Cold",
  productKind: "book",
  defaultProduct: "B04",
  formats: ["PT", "ST", "SQ"],
  fields: [
    { key: "hook", label: "Hook (Sinhala)", type: "textarea", lang: "si", auto: (p) => (p.kind === "book" ? p.book.hook || p.book.hookEn : ""), hint: "Empty = this book's hook from the copy bank. Keep it to 8 words or fewer." },
    {
      key: "hookEn",
      label: "English line",
      type: "text",
      auto: (p, f) => (p.kind === "book" ? (f.hook || p.book.hook ? p.book.hookEn : p.book.en + (p.book.enSub ? `: ${p.book.enSub}` : "")) : ""),
    },
    { key: "statNumber", label: "Proof number", type: "text", auto: (p) => (p.kind === "book" ? p.book.phrasesLabel : ""), hint: "Empty = the book's phrase count, rounded down." },
    { key: "statLabel", label: "Number label", type: "text" },
    { key: "bullets", label: "Bullets", type: "list", itemLabel: "Bullet", itemFields: [{ key: "text", label: "Text", type: "text" }], minItems: 0, maxItems: 3, hint: "PT only - SQ and ST hide them to keep the image text short." },
    { key: "price", label: "Price", type: "text", hint: "Empty hides the price chip." },
    { key: "priceWas", label: "Old price (struck through)", type: "text" },
    { key: "cta", label: "Call to action", type: "text" },
    { key: "mockup", label: "Mockup", type: "image", hint: "Transparent PNG of this book (e.g. b04-front.png). Empty = the flat cover with a 3D tilt." },
  ],
  defaultFields: {
    hook: "",
    hookEn: "",
    statNumber: "",
    statLabel: "real phrases",
    price: "Rs ____",
    priceWas: "",
    cta: "Order now · studypal.store",
    mockup: "",
  },
  defaultLists: {
    bullets: [{ text: "Pronunciation in Sinhala letters" }, { text: "Meaning + when to use it" }, { text: "Real-life situations" }],
  },
  colors: [
    { key: "accent", label: "Accent" },
    { key: "tint", label: "Tint (background)" },
  ],
  colorsFor: (p) => (p.kind === "book" ? { accent: p.book.accent, tint: p.book.tint } : { accent: "#591F82", tint: "#F4ECFA" }),
  backgroundColor: (c) => c.tint,
  component: AdS1CoverHero,
};
