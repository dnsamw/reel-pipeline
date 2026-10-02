import { useRef, type CSSProperties } from "react";
import { resolvePostAsset } from "../../posts/PostReady";
import { AdFrame, AdLogo, BrandBar, MockupSlot, OfferBar, siLang, useAdFit, useImageStatus } from "../AdKit";
import { BOOKS, COLLECTION, VALUE_LINE_SI } from "../products";
import type { AdTemplateDef, AdTemplateProps } from "../types";

// Port of ad-templates/ad-c1-the-shelf.html - "Template" CSS section, with
// the gold/purple literals turned into the --hi/--bg color slots and the
// JS-measured spine height expressed in container-query units.
const CSS = `
.c1 .big { margin: 64px 0 0; flex: none; font: 800 230px/.86 var(--f-display); letter-spacing: -0.05em; color: var(--hi); }
.c1 .big-label { margin: 22px 0 0; flex: none; font: 700 46px/1.15 var(--f-display); letter-spacing: -0.015em; color: #fff; }
.c1 .big-label[lang] { font: 700 40px/1.45 var(--f-si); letter-spacing: normal; }
.c1 .big-si { margin: 14px 0 0; flex: none; font: 600 36px/1.55 var(--f-si); color: rgba(255,255,255,.82); }
.c1 .big-si:empty { display: none; }

.c1 .shelf-area { position: relative; flex: 1; min-height: 430px; margin: 34px 0 26px; container-type: size; }
.c1 .shelf-area .mockup-slot { position: absolute; inset: 0; }
.c1 .shelf { position: absolute; left: 0; right: 0; bottom: 0; top: 0; display: flex; flex-direction: column; justify-content: flex-end; }
.c1 .spines { display: flex; align-items: flex-end; gap: 8px; padding: 0 14px; }
.c1 .spine { flex: 1; min-width: 0; position: relative; border-radius: 6px 6px 3px 3px; background: var(--s-accent);
  height: calc(90cqh - 26px);
  display: flex; flex-direction: column; align-items: center; padding: 14px 0 14px; overflow: hidden;
  box-shadow: inset -6px 0 0 rgba(0,0,0,.16), inset 3px 0 0 rgba(255,255,255,.12); }
.c1 .spine-num { width: 44px; height: 44px; flex: none; border-radius: 50%; background: var(--s-tint); color: var(--s-accent);
  display: grid; place-items: center; font: 800 22px var(--f-display); }
.c1 .spine-title { flex: 1; min-height: 0; max-width: calc(100% - 10px); margin: 14px 0; writing-mode: vertical-rl; transform: rotate(180deg);
  font: 700 28px/1 var(--f-display); color: var(--s-tint); white-space: nowrap; overflow: hidden; }
/* Two lines per spine, read bottom-to-top: the English title, then the Sinhala title "underneath" it. */
.c1 .spine-en, .c1 .spine-si { display: block; overflow: hidden; }
.c1 .spine-si { margin-block-start: 4px; font: 600 0.8em/1.45 var(--f-si); opacity: .9; }
.c1 .spine-si:empty { display: none; }
.c1 .spine .sp-logo { width: 38px; height: 38px; }
.c1 .plank { height: 26px; border-radius: 6px; background: var(--sp-purple-deep);
  box-shadow: inset 0 4px 0 var(--hi), 0 20px 30px -10px rgba(0,0,0,.55); }

.c1 .stat { flex: none; margin-bottom: 30px; font: 600 36px/1.3 var(--f-body); color: rgba(255,255,255,.92); }
.c1 .stat b { color: var(--hi); font-weight: 700; }

.ad.c1[data-format="SQ"] .big { margin-top: 40px; font-size: 180px; }
.ad.c1[data-format="SQ"] .big-label { font-size: 40px; margin-top: 14px; }
.ad.c1[data-format="SQ"] .big-si { display: none; }
.ad.c1[data-format="SQ"] .shelf-area { min-height: 330px; margin: 24px 0 18px; }
.ad.c1[data-format="SQ"] .stat { margin-bottom: 22px; }

.ad.c1[data-format="ST"] .big { margin-top: 48px; font-size: 190px; }
.ad.c1[data-format="ST"] .shelf-area { min-height: 520px; }
.ad.c1[data-format="ST"] .spines { gap: 6px; padding: 0 8px; }
.ad.c1[data-format="ST"] .spine-num { width: 36px; height: 36px; font-size: 18px; }
.ad.c1[data-format="ST"] .spine-title { font-size: 24px; }
.ad.c1[data-format="ST"] .spine .sp-logo { width: 30px; height: 30px; }
`;

/**
 * The HTML's spine-title pass, extended to two lines: shrink each line 1px at a
 * time until it fits along its spine, then shrink both until together they fit
 * across the spine's width.
 */
function fitSpineTitles(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".spine-title").forEach((t) => {
    const lines = Array.from(t.children) as HTMLElement[];
    lines.forEach((l) => (l.style.fontSize = ""));
    for (const l of lines) {
      let fs = parseFloat(getComputedStyle(l).fontSize);
      while (l.scrollHeight > l.clientHeight + 1 && fs > 9) {
        fs -= 1;
        l.style.fontSize = `${fs}px`;
      }
    }
    for (let guard = 0; guard < 40 && t.scrollWidth > t.clientWidth + 1; guard++) {
      let moved = false;
      for (const l of lines) {
        const fs = parseFloat(getComputedStyle(l).fontSize);
        if (fs > 9) {
          l.style.fontSize = `${fs - 1}px`;
          moved = true;
        }
      }
      if (!moved) break;
    }
  });
}

const defaultSpineEn = (n: number) => BOOKS[n - 1].spine + (n === 8 ? " 18+" : "");

function AdC1TheShelf({ format, fields, lists, colors, mockup }: AdTemplateProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const status = useImageStatus(resolvePostAsset(fields.mockup));
  const spines = lists.spines ?? [];

  // Spine titles depend on the final shelf height, so they're fitted after the main pass.
  useAdFit(rootRef, [format, JSON.stringify(fields), JSON.stringify(spines), status], fitSpineTitles);

  return (
    <AdFrame format={format} className="c1 purple" css={CSS} vars={{ "--bg": colors.bg, "--glow": colors.glow, "--hi": colors.hi }} rootRef={rootRef}>
      <BrandBar chip={fields.chip} />
      <div className="big" data-fit data-min="120">
        {fields.bigNumber}
      </div>
      <div className="big-label" {...siLang(fields.bigLabel)} data-fit data-min="30">
        {fields.bigLabel}
      </div>
      <div className="big-si" lang="si" data-fit data-min="26">
        {fields.bigLabelSi}
      </div>
      <div className="shelf-area">
        {status === "ok" ? (
          <MockupSlot src={fields.mockup} book={BOOKS[0]} adjust={mockup} />
        ) : status === "loading" ? null : (
          <div className="shelf">
            <div className="spines">
              {BOOKS.map((b) => (
                <div key={b.n} className="spine" style={{ "--s-accent": b.accent, "--s-tint": b.tint } as CSSProperties}>
                  <span className="spine-num">{b.n}</span>
                  <span className="spine-title">
                    <span className="spine-en">{spines[b.n - 1]?.en ?? defaultSpineEn(b.n)}</span>
                    <span className="spine-si" lang="si">
                      {spines[b.n - 1]?.si ?? ""}
                    </span>
                  </span>
                  <AdLogo bg={b.tint} fg={b.accent} />
                </div>
              ))}
            </div>
            <div className="plank" />
          </div>
        )}
      </div>
      <div className="stat" data-fit data-min="26">
        {fields.statLine ? (
          <span {...siLang(fields.statLine)}>{fields.statLine}</span>
        ) : (
          <>
            <b>{COLLECTION.books} books</b> · {COLLECTION.volumes} volumes · Sinhala pronunciation
          </>
        )}
      </div>
      <OfferBar price={fields.price} priceWas={fields.priceWas} saveBadge={fields.saveBadge} cta={fields.cta} />
    </AdFrame>
  );
}

export const adC1TheShelf: AdTemplateDef = {
  id: "ad-c1-the-shelf",
  code: "C1",
  name: "C1 · The Shelf",
  description: "The complete collection: a giant gold phrase count over all ten spines on a shelf, with price and saving.",
  funnel: "Cold",
  productKind: "collection",
  defaultProduct: "ALL",
  formats: ["PT", "ST", "SQ"],
  fields: [
    { key: "chip", label: "Corner chip", type: "text" },
    { key: "bigNumber", label: "Big number", type: "text" },
    { key: "bigLabel", label: "Label", type: "text" },
    { key: "bigLabelSi", label: "Sinhala line", type: "textarea", lang: "si", hint: "Hidden on SQ. Empty hides it." },
    { key: "statLine", label: "Stat line", type: "text", placeholder: () => `${COLLECTION.books} books · ${COLLECTION.volumes} volumes · Sinhala pronunciation` },
    { key: "price", label: "Price", type: "text", hint: "Empty hides the price chip." },
    { key: "priceWas", label: "Old price (struck through)", type: "text" },
    { key: "saveBadge", label: "Save badge", type: "text", hint: "Empty hides it." },
    { key: "cta", label: "Call to action", type: "text" },
    { key: "mockup", label: "Mockup (shelf / box set)", type: "image", hint: "e.g. collection-shelf.png. Empty = a CSS bookshelf of all ten spines." },
    {
      key: "spines",
      label: "Shelf spines",
      type: "list",
      itemLabel: "Book",
      itemFields: [
        { key: "en", label: "English name", type: "text" },
        { key: "si", label: "Sinhala name (under it)", type: "text", lang: "si" },
      ],
      minItems: 10,
      maxItems: 10,
      fixed: true,
      hint: "The names on the CSS bookshelf (used when there's no mockup image). Long names shrink to fit their spine; an empty Sinhala name hides that line.",
    },
  ],
  defaultFields: {
    chip: "Complete set",
    bigNumber: COLLECTION.phrasesLabel,
    bigLabel: "English phrases for every situation, in Sinhala",
    bigLabelSi: VALUE_LINE_SI,
    statLine: "",
    price: "Rs ____",
    priceWas: "Rs ____",
    saveBadge: "Save __%",
    cta: "Order now · studypal.store",
    mockup: "",
  },
  defaultLists: {
    spines: BOOKS.map((b) => ({ en: defaultSpineEn(b.n), si: b.si })),
  },
  colors: [
    { key: "bg", label: "Background" },
    { key: "glow", label: "Background glow" },
    { key: "hi", label: "Highlight (big number)" },
  ],
  colorsFor: () => ({ bg: "#591F82", glow: "#6E2A9E", hi: "#F9B200" }),
  backgroundColor: (c) => c.bg,
  component: AdC1TheShelf,
};
