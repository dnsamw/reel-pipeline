import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DependencyList, type ReactNode, type RefObject } from "react";
import { loadFont as loadBricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as loadFigtree } from "@remotion/google-fonts/Figtree";
import { loadFont as loadNotoSinhala } from "@remotion/google-fonts/NotoSansSinhala";
import { resolvePostAsset, usePostHold } from "../posts/PostReady";
import { AD_FORMATS, type AdFormat, type AdMockupAdjust } from "./types";
import type { AdBook } from "./products";

/*
 * Shared runtime for the ad templates - the React port of the "Shared tokens"
 * CSS and "Shared runtime" script that every ad-templates/*.html design
 * carries (they're byte-identical across the four files). Each template
 * component renders <AdFrame> with its own CSS on top of AD_BASE_CSS.
 */

// --- Fonts -------------------------------------------------------------------

let fontsLoaded: Promise<unknown> | null = null;

/** The ads plan's three fonts (Part 6.2) at every weight the designs use. Idempotent. */
export function loadAdFonts(): Promise<unknown> {
  fontsLoaded ??= Promise.all([
    loadBricolage("normal", { weights: ["600", "700", "800"], subsets: ["latin"] }).waitUntilDone(),
    loadFigtree("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).waitUntilDone(),
    // Latin too, like the designs' Google Fonts link - English words inside a Sinhala line
    // ("වීසා interview ...") would otherwise fall back to a serif system font.
    loadNotoSinhala("normal", { weights: ["500", "600", "700"], subsets: ["sinhala", "latin"] }).waitUntilDone(),
  ]);
  return fontsLoaded;
}

// --- CSS ---------------------------------------------------------------------

const SCOPE = "spad-scope";

/**
 * Prefixes every selector with `.spad-scope ` so the ported CSS can't leak
 * into the GUI (and GUI rules can't win over it). A uniform prefix adds the
 * same specificity to every rule, so the designs' cascade is unchanged and
 * their CSS can stay verbatim. Handles flat rule lists only - no @media.
 */
function scopeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/([^{}]+)\{([^{}]*)\}/g, (_, selectors: string, body: string) => {
      const scoped = selectors
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `.${SCOPE} ${s}`)
        .join(", ");
      return `${scoped}{${body}}\n`;
    });
}

/** ad-templates/*.html "Shared tokens" + "Ad root" + offer/mockup styles, minus the preview chrome. */
const AD_BASE_CSS = `
.ad {
  --sp-purple: #591F82; --sp-purple-deep: #3B1259; --sp-purple-light: #6E2A9E; --sp-gold: #F9B200;
  --page: #EDF0F6; --surface: #FFFFFF; --ink: #1B2140; --ink-soft: #3A4166; --muted: #6A7194; --line: #E1E5EF;
  --f-display: "Bricolage Grotesque", "Segoe UI", system-ui, sans-serif;
  --f-body: "Figtree", "Segoe UI", system-ui, sans-serif;
  --f-si: "Noto Sans Sinhala", "Iskoola Pota", "Nirmala UI", sans-serif;
  --accent: #591F82; --tint: #F4ECFA;
  --deep: color-mix(in srgb, var(--accent) 72%, #000);
  --light: color-mix(in srgb, var(--accent) 70%, #fff);
  position: absolute; top: 0; left: 0;
  width: 1080px; height: 1350px; overflow: hidden; color: var(--ink);
  font-family: var(--f-body); font-size: 16px; font-weight: 400; line-height: normal; letter-spacing: normal; text-align: left;
}
.ad * { box-sizing: border-box; }
.ad[data-format="SQ"] { height: 1080px; }
.ad[data-format="ST"] { height: 1920px; }
.ad-inner { position: absolute; inset: 0; padding: 72px; display: flex; flex-direction: column; }
.ad[data-format="ST"] .ad-inner { padding: 270px 200px 380px 150px; }

[lang="si"] { font-family: var(--f-si); line-height: 1.5; letter-spacing: normal; }

.brand-bar { display: flex; align-items: center; gap: 18px; flex: none; }
.sp-logo { width: 72px; height: 72px; flex: none; display: block; }
.brand-name { font-family: var(--f-display); font-weight: 700; font-size: 36px; letter-spacing: -0.01em; }
.chip { margin-left: auto; padding: 10px 22px; border-radius: 99px; font-family: var(--f-display);
        font-weight: 700; font-size: 28px; white-space: nowrap; }
.chip:empty { display: none; }
.ad[data-format="ST"] .sp-logo { width: 64px; height: 64px; }
.ad[data-format="ST"] .brand-name { font-size: 32px; }

.offer-bar { display: flex; align-items: center; gap: 20px; flex: none; flex-wrap: wrap; }
.price-chip { display: inline-flex; align-items: baseline; gap: 16px; padding: 14px 28px; border-radius: 20px;
              background: var(--sp-gold); color: var(--sp-purple-deep); font-family: var(--f-display); white-space: nowrap; }
.price { font-weight: 800; font-size: 56px; line-height: 1; }
.price-was { font-weight: 700; font-size: 30px; text-decoration: line-through; text-decoration-thickness: 3px; opacity: .65; }
.price:empty, .price-was:empty { display: none; }
.price-chip:has(.price:empty) { display: none; }
.save-badge { padding: 12px 20px; border-radius: 14px; font-family: var(--f-display); font-weight: 800; font-size: 30px; white-space: nowrap; }
.save-badge:empty { display: none; }
.cta { margin-left: auto; font-weight: 600; font-size: 30px; white-space: nowrap; }
.cta:empty { display: none; }

/* Mockup slots. The HTML measured each slot in JS to size the fallback
   cover; here slots are size containers and the cover uses cq units. */
.mockup-slot { position: relative; container-type: size; }
.mockup-shadow { position: absolute; left: 50%; bottom: -16px; height: 44px; transform: translateX(-50%);
  background: radial-gradient(ellipse at center, rgba(15,20,40,.40) 0%, rgba(15,20,40,0) 70%); filter: blur(6px); }
.mockup-shadow.for-image { width: 80cqw; }
.mockup-shadow.for-cover { width: calc(min(100cqh, 150cqw) * 2 / 3 * .95); }
.mockup { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center bottom;
  transform: translate(var(--mx,0px), var(--my,0px)) scale(var(--ms,1)) rotate(var(--mr,0deg)); transform-origin: center bottom;
  filter: drop-shadow(0 30px 40px rgba(15,20,40,.28)); }
.cover-wrap { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); transform-origin: center bottom;
  height: min(100cqh, 150cqw); aspect-ratio: 2 / 3; }
.cover-wrap.is-tilted { transform: translateX(-50%) perspective(1600px) rotateY(-18deg) rotateX(2deg); }
.cover-img { display: block; width: 100%; height: 100%; object-fit: cover; border-radius: 4px 10px 10px 4px;
  box-shadow: inset 6px 0 10px rgba(0,0,0,.18), 24px 30px 50px -10px rgba(15,20,40,.35); }

/* CSS fallback cover (base 400x600, scaled to the wrap by CssCover) */
.css-cover { position: absolute; left: 0; top: 0; width: 400px; height: 600px; transform-origin: 0 0; overflow: hidden;
  background: var(--c-accent); border-radius: 4px 10px 10px 4px;
  box-shadow: inset 7px 0 0 rgba(0,0,0,.14), 24px 30px 50px -10px rgba(15,20,40,.40); }
.css-cover .cc-glow { position: absolute; right: -120px; top: -110px; width: 360px; height: 360px; border-radius: 50%;
  background: color-mix(in srgb, var(--c-accent) 70%, #fff); opacity: .45; }
.css-cover .cc-bubble { position: absolute; left: 84px; top: 92px; width: 190px; height: 112px; border-radius: 30px; background: var(--c-tint); }
.css-cover .cc-bubble::after { content: ""; position: absolute; left: 34px; bottom: -26px; border: 16px solid transparent;
  border-top: 22px solid var(--c-tint); border-left-width: 6px; }
.css-cover .cc-dots { position: absolute; left: 124px; top: 140px; display: flex; gap: 22px; }
.css-cover .cc-dots i { width: 18px; height: 18px; border-radius: 50%; background: var(--c-accent); }
.css-cover .cc-dots i:nth-child(2) { opacity: .7; } .css-cover .cc-dots i:nth-child(3) { opacity: .45; }
.css-cover .cc-top { position: absolute; top: 24px; left: 26px; right: 26px; display: flex; justify-content: space-between;
  color: #fff; font: 600 13px var(--f-body); }
.css-cover .cc-badge { background: #fff; color: var(--c-accent); border-radius: 99px; padding: 2px 10px; font: 800 14px var(--f-display); }
.css-cover .cc-panel { position: absolute; left: 0; right: 0; bottom: 0; height: 58%; background: var(--c-tint);
  border-top-right-radius: 88px; padding: 30px 28px 22px; display: flex; flex-direction: column; }
.css-cover .cc-num { font: 700 15px var(--f-display); color: var(--c-accent); }
.css-cover .cc-si { margin-top: 6px; font: 700 38px/1.4 var(--f-si); color: color-mix(in srgb, var(--c-accent) 72%, #000); }
.css-cover .cc-en { margin-top: 6px; font: 700 19px/1.2 var(--f-display); color: color-mix(in srgb, var(--c-accent) 60%, #000); }
.css-cover .cc-foot { margin-top: auto; display: flex; align-items: center; gap: 10px; padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--c-accent) 22%, transparent); font: 700 17px var(--f-display);
  color: color-mix(in srgb, var(--c-accent) 72%, #000); }
.css-cover .cc-foot .sp-logo { width: 30px; height: 30px; }

/* The shared "purple" look of the pack + collection ads (M1, C1) */
.ad.purple { background: radial-gradient(circle at 50% 58%, color-mix(in srgb, var(--glow) 90%, transparent) 0%, transparent 55%), var(--bg); color: #fff; }
.purple .brand-name { color: #fff; }
.purple .chip { background: transparent; color: var(--hi); border: 3px solid var(--hi); }
.purple .save-badge { background: #fff; color: var(--sp-purple-deep); }
.purple .cta { color: rgba(255,255,255,.92); }
.purple .price-chip { box-shadow: 0 16px 30px -14px rgba(0,0,0,.5); }
.ad.purple[data-format="ST"] .cta { margin-left: 0; width: 100%; }
`;

const scopedBase = scopeCss(AD_BASE_CSS);
const scopedCache = new Map<string, string>();

/**
 * The ad's root: a W×H box (the format's size) holding the scoped CSS and
 * the `<article class="ad">` the designs style. `vars` are CSS custom
 * properties on the article (--accent, --tint, ...).
 */
export function AdFrame({
  format,
  className,
  css,
  vars,
  rootRef,
  children,
}: {
  format: AdFormat;
  className: string;
  /** The template's own CSS (the HTML's "Template" section), scoped like the base. */
  css: string;
  vars: Record<string, string>;
  rootRef?: RefObject<HTMLDivElement>;
  children: ReactNode;
}) {
  let scoped = scopedCache.get(css);
  if (scoped === undefined) {
    scoped = scopeCss(css);
    scopedCache.set(css, scoped);
  }
  const { width, height } = AD_FORMATS[format];
  return (
    <div className={SCOPE} style={{ position: "relative", width, height, overflow: "hidden" }}>
      <style>{scopedBase + scoped}</style>
      <div ref={rootRef} className={`ad ${className}`} data-format={format} style={vars as CSSProperties}>
        <div className="ad-inner">{children}</div>
      </div>
    </div>
  );
}

// --- Logo, offer bar ---------------------------------------------------------

const LOGO_PATH =
  "M87.787 36.736a20.05 20.05 0 0 0-14.263-5.912 20.05 20.05 0 0 0-14.264 5.912L36.034 59.962a12.59 12.59 0 0 1-8.962 3.707 12.55 12.55 0 0 1-8.952-3.717A12.53 12.53 0 0 1 14.404 51c0-3.378 1.314-6.56 3.716-8.962a12.58 12.58 0 0 1 8.952-3.707 12.58 12.58 0 0 1 8.962 3.707l5.463 5.464 4.961-.46.342-4.842-5.464-5.464a20.05 20.05 0 0 0-14.264-5.912 20.05 20.05 0 0 0-14.264 5.912C8.998 40.546 6.896 45.613 6.896 51s2.102 10.452 5.912 14.265a20.05 20.05 0 0 0 14.264 5.911 20.05 20.05 0 0 0 14.264-5.911l23.226-23.227a12.59 12.59 0 0 1 8.963-3.707c3.378 0 6.56 1.313 8.952 3.707 4.944 4.945 4.944 12.979 0 17.924a12.58 12.58 0 0 1-8.952 3.707 12.59 12.59 0 0 1-8.963-3.707L58.301 53.7l-.342 4.842-4.961.46-.045-.045v.001l6.308 6.307a20.05 20.05 0 0 0 14.264 5.911 20.05 20.05 0 0 0 14.263-5.911c7.862-7.866 7.862-20.665-.001-28.529";

/** The StudyPal mark - sized by the .sp-logo CSS (72px, 64px on ST). */
export function AdLogo({ bg = "#F9B200", fg = "#591F82" }: { bg?: string; fg?: string }) {
  return (
    <svg className="sp-logo" viewBox="0 0 300 300" aria-hidden="true">
      <rect width="300" height="300" rx="64" fill={bg} />
      <g fill={fg} transform="matrix(2.3512290156904005,0,0,2.3512290156904005,31.75624218697046,30.09)">
        <path d={LOGO_PATH} />
      </g>
    </svg>
  );
}

/** `lang="si"` when the text contains Sinhala - the designs' setText() rule, so Sinhala gets its font and line-height. */
export function siLang(text: string | undefined): { lang?: string } {
  return /[඀-෿]/.test(text ?? "") ? { lang: "si" } : {};
}

export function BrandBar({ chip, chipClassName }: { chip: string; chipClassName?: string }) {
  return (
    <div className="brand-bar">
      <AdLogo />
      <span className="brand-name">StudyPal</span>
      <span className={`chip${chipClassName ? ` ${chipClassName}` : ""}`}>{chip}</span>
    </div>
  );
}

export function OfferBar({ price, priceWas, saveBadge, cta }: { price: string; priceWas: string; saveBadge?: string; cta: string }) {
  return (
    <div className="offer-bar">
      <div className="price-chip">
        <span className="price">{price}</span>
        <span className="price-was">{priceWas}</span>
      </div>
      {saveBadge !== undefined && <span className="save-badge">{saveBadge}</span>}
      <span className="cta" {...siLang(cta)}>
        {cta}
      </span>
    </div>
  );
}

// --- Text fitting ------------------------------------------------------------

/**
 * The designs' fitText() (Part 7.5): while .ad-inner overflows, lower every
 * visible [data-fit] element's font size in 2px steps down to its data-min;
 * an element that's only too wide shrinks on its own. Then `after` runs for
 * template-specific passes that need the final layout (e.g. C1's spines).
 * Font sizes are written to the DOM imperatively, so the elements must not
 * get fontSize from React. Holds the render until the pass has run.
 */
export function useAdFit(rootRef: RefObject<HTMLDivElement>, deps: DependencyList, after?: (root: HTMLElement) => void): void {
  const hold = usePostHold();

  useLayoutEffect(() => {
    let cancelled = false;
    const release = hold("ad: fit");

    function fit() {
      const root = rootRef.current;
      const inner = root?.querySelector<HTMLElement>(".ad-inner");
      if (!root || !inner) return;
      const els = Array.from(root.querySelectorAll<HTMLElement>("[data-fit]"));
      els.forEach((e) => (e.style.fontSize = ""));
      const visible = els.filter((e) => e.offsetParent !== null);
      const base = visible.map((e) => parseFloat(getComputedStyle(e).fontSize));
      const min = visible.map((e) => Number(e.dataset.min || 28));
      const tallOver = () => inner.scrollHeight > inner.clientHeight + 1;
      const ownOver = (e: HTMLElement) => e.scrollWidth > e.clientWidth + 1;
      for (let step = 0; step < 120; step++) {
        const tall = tallOver();
        let moved = false;
        visible.forEach((e, i) => {
          if (!tall && !ownOver(e)) return;
          const cur = parseFloat(e.style.fontSize || String(base[i]));
          if (cur - 2 >= min[i]) {
            e.style.fontSize = `${cur - 2}px`;
            moved = true;
          }
        });
        if (!moved) break;
      }
      after?.(root);
    }

    // Once now (no flash of overflowing text in the GUI), again once web fonts settle.
    fit();
    document.fonts.ready.then(() => {
      if (!cancelled) fit();
      release();
    });
    return () => {
      cancelled = true;
      release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// --- Images ------------------------------------------------------------------

export type ImageStatus = "none" | "loading" | "ok" | "error";

/**
 * Probes an image like the designs' loadImg(): "ok" once it has loaded and
 * decoded, "error" if it can't (so the caller falls back to the cover).
 * Holds the render until the outcome is committed - released from a passive
 * effect, i.e. after React has rendered the image or its fallback.
 */
export function useImageStatus(src: string): ImageStatus {
  const hold = usePostHold();
  const [state, setState] = useState<{ src: string; status: ImageStatus }>({ src: "", status: "none" });
  const releaseRef = useRef<(() => void) | null>(null);

  useLayoutEffect(() => {
    if (!src) return;
    let alive = true;
    const release = hold("ad: load image");
    releaseRef.current = release;
    const img = new Image();
    img.onload = () => {
      img
        .decode()
        .catch(() => {})
        .finally(() => alive && setState({ src, status: "ok" }));
    };
    img.onerror = () => alive && setState({ src, status: "error" });
    img.src = src;
    return () => {
      alive = false;
      release();
    };
  }, [src, hold]);

  const status: ImageStatus = !src ? "none" : state.src === src ? state.status : "loading";

  useEffect(() => {
    if (status === "ok" || status === "error") {
      releaseRef.current?.();
      releaseRef.current = null;
    }
  }, [status]);

  return status;
}

/** An <img> that holds the render until it has painted its (already probed) source. */
function HeldImg({ src, className, style }: { src: string; className: string; style?: CSSProperties }) {
  const ref = useRef<HTMLImageElement>(null);
  const hold = usePostHold();
  useLayoutEffect(() => {
    const img = ref.current;
    if (!img || img.complete) return;
    const release = hold("ad: paint image");
    img.addEventListener("load", release, { once: true });
    img.addEventListener("error", release, { once: true });
    return release;
  }, [src, hold]);
  return <img ref={ref} src={src} alt="" className={className} style={style} />;
}

// --- Mockups -----------------------------------------------------------------

/** The CSS-only cover (no mockup, no cover PNG): a 400x600 design scaled to its wrap. */
function CssCover({ book }: { book: AdBook }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const c = ref.current;
    const wrap = c?.parentElement;
    if (!c || !wrap) return;
    const fit = () => {
      c.style.transform = `scale(${wrap.offsetWidth / 400})`;
      const si = c.querySelector<HTMLElement>(".cc-si");
      const panel = c.querySelector<HTMLElement>(".cc-panel");
      if (!si || !panel) return;
      let s = 38;
      si.style.fontSize = `${s}px`;
      while (panel.scrollHeight > panel.clientHeight && s > 18) {
        s -= 1;
        si.style.fontSize = `${s}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [book]);

  return (
    <div ref={ref} className="css-cover" style={{ "--c-accent": book.accent, "--c-tint": book.tint } as CSSProperties}>
      <div className="cc-glow" />
      <div className="cc-bubble" />
      <div className="cc-dots">
        <i />
        <i />
        <i />
      </div>
      <div className="cc-top">
        <span>The Ultimate Practical English Book</span>
        {book.n === 8 && <span className="cc-badge">18+</span>}
      </div>
      <div className="cc-panel">
        <div className="cc-num">Book {String(book.n).padStart(2, "0")}</div>
        <div className="cc-si" lang="si">
          {book.si}
        </div>
        <div className="cc-en">{book.en}</div>
        <div className="cc-foot">
          <AdLogo bg={book.accent} fg={book.tint} />
          <span>StudyPal</span>
        </div>
      </div>
    </div>
  );
}

/** The flat cover PNG with the CSS 3D treatment (Part 8.5), or the CSS cover if the PNG is missing. */
function CoverMockup({ book, tilt }: { book: AdBook; tilt: boolean }) {
  const src = resolvePostAsset(book.cover);
  const status = useImageStatus(src);
  return (
    <>
      <div className="mockup-shadow for-cover" />
      <div className={`cover-wrap${tilt ? " is-tilted" : ""}`}>
        {status === "ok" && <HeldImg src={src} className="cover-img" />}
        {status === "error" && <CssCover book={book} />}
      </div>
    </>
  );
}

/**
 * The designs' fillSlot(): the mockup image if it loads, else the book's flat
 * cover, else the CSS cover. `adjust` (the per-ad nudges) only applies to a
 * real mockup image, as in the HTML.
 */
export function MockupSlot({
  src,
  book,
  tilt = true,
  adjust,
  className = "mockup-slot",
  style,
}: {
  /** Raw field value (assets/-relative path, URL or data: URI) - "" = cover fallback. */
  src: string;
  book: AdBook;
  tilt?: boolean;
  adjust?: AdMockupAdjust;
  className?: string;
  style?: CSSProperties;
}) {
  const resolved = resolvePostAsset(src);
  const status = useImageStatus(resolved);
  const nudge = adjust
    ? ({ "--ms": String(adjust.scale), "--mx": `${adjust.x}px`, "--my": `${adjust.y}px`, "--mr": `${adjust.rotate}deg` } as CSSProperties)
    : undefined;
  return (
    <div className={className} style={style}>
      {status === "ok" ? (
        <>
          <div className="mockup-shadow for-image" />
          <HeldImg src={resolved} className="mockup" style={nudge} />
        </>
      ) : status === "loading" ? null : (
        <CoverMockup book={book} tilt={tilt} />
      )}
    </div>
  );
}
