import { Fragment, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { hexToRgba, resolvePostAsset, usePostHold } from "../PostReady";
import { useFitFontSize } from "../useFitFontSize";
import { loadPostFonts, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostFields, PostTemplateDef, PostTemplateProps } from "../types";

/**
 * The "photo + long caption" Facebook format (post-ideas/fb-image-with-long-caption-content):
 * a full-bleed photo with one big high-contrast Sinhala hook box between two
 * pills (the lower one sends people into the caption, where the real content -
 * a long phrase list - and the StudyPal offer live). The block slides up and
 * down as one unit to keep the photo's subject clear. 1080x1350 (4:5) - the tallest image the
 * feed shows uncropped. The image stays an organic-looking hook on purpose:
 * no price, only small brand and WhatsApp marks in the bottom corners.
 */

const W = 1080;
const H = 1350;

/** `**300**` in the hook is drawn in the highlight color. */
function withHighlights(text: string, color: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} style={{ color, fontWeight: 800 }}>
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}

const plainHook = (hook: string) => hook.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\s*\n\s*/g, " ").trim();

const UP_ARROW = (
  <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
    <path d="M12 20V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const DOWN_ARROW = (
  <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" style={{ flex: "none" }}>
    <path d="M12 4v15M5.5 12.5 12 19l6.5-6.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** A generic chat-bubble-with-handset mark in WhatsApp green (not the trademarked logo). */
function WhatsAppMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flex: "none", filter: `drop-shadow(0 2px 6px ${hexToRgba("#000000", 0.45)})` }}>
      <path d="M24 3C12.4 3 3 12.2 3 23.6c0 3.9 1.1 7.6 3.1 10.7L3.6 45l11-2.9c2.9 1.6 6.1 2.4 9.4 2.4 11.6 0 21-9.2 21-20.6S35.6 3 24 3z" fill="#25D366" />
      <path
        d="M18.2 13.6c-.5-1.1-1-1.1-1.4-1.1h-1.2c-.4 0-1.1.2-1.7.8s-2.2 2.1-2.2 5.2 2.3 6.1 2.6 6.5c.3.4 4.4 7 10.9 9.5 5.4 2.1 6.5 1.7 7.7 1.6 1.2-.1 3.8-1.5 4.3-3s.5-2.8.4-3c-.2-.3-.6-.4-1.2-.7s-3.8-1.8-4.4-2c-.6-.2-1-.3-1.4.3s-1.6 2-2 2.4c-.4.4-.7.5-1.3.2-.6-.3-2.6-.9-4.9-3-1.8-1.6-3-3.6-3.4-4.2-.4-.6 0-.9.3-1.2l.9-1.1c.3-.4.4-.6.6-1 .2-.4.1-.8 0-1.1l-1.6-4.1z"
        fill="#ffffff"
      />
    </svg>
  );
}

function StudyPalHookPhoto({ fields, colors: c, insets }: PostTemplateProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const hookRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hold = usePostHold();

  const imgSrc = resolvePostAsset(fields.image ?? "");
  const pct = (v: string | undefined, fallback: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
  const zoom = pct(fields.imageZoom, 100, 100, 400) / 100;
  const imgX = pct(fields.imageX, 50);
  const imgY = pct(fields.imageY, 50);
  const overlay = pct(fields.overlayOpacity, 0, 0, 90) / 100;
  const boxOpacity = pct(fields.boxOpacity, 100, 20, 100) / 100;
  // The size you ask for; the fit below only goes smaller if it wouldn't fit.
  const hookSize = pct(fields.hookSize, 80, 36, 130);
  // 0 = top, 100 = bottom of the free area; the pills and the box move together.
  const posY = Math.min(100, Math.max(0, Number(fields.offsetY ?? 50) || 0));

  // Line breaks typed into the hook are kept exactly (no wrapping), so the fit
  // also shrinks until the widest of those lines fits; without breaks it wraps.
  const manualLines = (fields.hook ?? "").includes("\n");
  useFitFontSize(
    areaRef,
    hookRef,
    { max: hookSize, min: Math.min(36, hookSize), alsoOver: () => manualLines && !!hookRef.current && hookRef.current.scrollWidth > hookRef.current.clientWidth + 1 },
    [fields.hook, fields.pointer, fields.topPill, JSON.stringify(insets)],
  );

  // Block a render capture until the photo is decoded - otherwise renderStill can capture an empty <img>.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !imgSrc || img.complete) return;
    const release = hold("post: load image");
    img.addEventListener("load", release, { once: true });
    img.addEventListener("error", release, { once: true });
    return release;
  }, [imgSrc, hold]);

  const padX = Math.max(56, insets.left, insets.right);
  const marksBottom = Math.max(52, insets.bottom + 20);

  const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };
  const pill: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 32px",
    borderRadius: 999,
    background: hexToRgba(c.pillBg, 0.88),
    color: c.pillText,
    fontFamily: postFonts.sinhala,
    fontWeight: 700,
    fontSize: 36,
    lineHeight: 1.45,
    whiteSpace: "nowrap",
  };
  const mark: CSSProperties = {
    position: "absolute",
    bottom: marksBottom,
    display: "flex",
    alignItems: "center",
    gap: 14,
    color: "#ffffff",
    fontFamily: postFonts.display,
    fontWeight: 700,
    fontSize: 32,
    textShadow: `0 2px 10px ${hexToRgba("#000000", 0.6)}`,
  };

  return (
    <div style={{ width: W, height: H, position: "relative", overflow: "hidden", background: c.fallback, fontFamily: postFonts.sinhala }}>
      {imgSrc ? (
        <img
          ref={imgRef}
          src={imgSrc}
          alt=""
          style={{
            ...fill,
            objectFit: "cover",
            // Zoom in towards the chosen point; that point is also which part of a
            // too-wide/too-tall photo the cover crop keeps.
            objectPosition: `${imgX}% ${imgY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${imgX}% ${imgY}%`,
          }}
        />
      ) : (
        <div style={{ ...fill, background: `radial-gradient(circle at 30% 20%, ${hexToRgba("#ffffff", 0.18)} 0%, transparent 55%), ${c.fallback}` }} />
      )}
      {/* A light shade so the corner marks and pills read on any photo, without dulling it. */}
      <div
        style={{
          ...fill,
          background: `linear-gradient(180deg, ${hexToRgba(c.shade, 0.18)} 0%, ${hexToRgba(c.shade, 0)} 30%, ${hexToRgba(c.shade, 0)} 70%, ${hexToRgba(c.shade, 0.45)} 100%)`,
        }}
      />
      {/* Flat overlay for bright photos, so the box and pills stand out. */}
      {overlay > 0 && <div style={{ ...fill, background: hexToRgba(c.overlay, overlay) }} />}

      {/* The free area between the top edge and the corner marks. Flex spacers
          split its spare height by the slider, so the block stays in flow and
          the fit can still see when it doesn't fit. */}
      <div
        ref={areaRef}
        style={{
          position: "absolute",
          left: padX,
          right: padX,
          top: Math.max(48, insets.top + 20),
          bottom: marksBottom + 84,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: `${posY} 1 0`, minHeight: 0 }} />
        <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
          {fields.topPill?.trim() && (
            <div lang="si" style={{ ...pill, paddingRight: 30 }}>
              {fields.topPill}
              {UP_ARROW}
            </div>
          )}
          <div
            style={{
              alignSelf: "stretch",
              background: hexToRgba(c.boxBg, boxOpacity),
              borderRadius: 28,
              padding: "40px 44px",
              boxShadow: `0 18px 40px -18px ${hexToRgba("#000000", 0.55 * boxOpacity)}`,
            }}
          >
            <div>
              {/* fontSize is set by useFitFontSize, deliberately not here */}
              <div
                ref={hookRef}
                lang="si"
                style={{
                  fontFamily: postFonts.sinhala,
                  fontWeight: 700,
                  lineHeight: 1.42,
                  textAlign: "center",
                  color: c.boxText,
                  textWrap: "balance",
                  whiteSpace: manualLines ? "pre" : "pre-line",
                } as CSSProperties}
              >
                {withHighlights(fields.hook ?? "", c.highlight)}
              </div>
            </div>
          </div>
          {fields.pointer?.trim() && (
            <div lang="si" style={{ ...pill, paddingRight: 30 }}>
              {fields.pointer}
              {DOWN_ARROW}
            </div>
          )}
        </div>
        <div style={{ flex: `${100 - posY} 1 0`, minHeight: 0 }} />
      </div>

      {fields.brand?.trim() && (
        <div style={{ ...mark, left: padX }}>
          <StudyPalLogo size={52} tile={c.brandTile} ink={c.brandInk} />
          {fields.brand}
        </div>
      )}
      {fields.imageWhatsapp?.trim() && (
        <div style={{ ...mark, right: padX }}>
          <WhatsAppMark size={52} />
          {fields.imageWhatsapp}
        </div>
      )}
    </div>
  );
}

/** "078 44 89 045" -> "94784489045" (Sri Lankan local number to wa.me's international form). */
export function waNumber(local: string): string {
  const digits = (local ?? "").replace(/\D/g, "");
  if (digits.startsWith("94")) return digits;
  return digits.startsWith("0") ? `94${digits.slice(1)}` : digits;
}

export const POST_CONTENT_PLACEHOLDER = "[[ POST CONTENT - ඔයාගේ වාක්‍ය ලිස්ට් එක මෙතනට paste කරන්න ]]";

/**
 * The caption: hook line + a "see below" line (the only part shown before
 * "See more"), a placeholder for the phrase list you paste in, then the
 * StudyPal tail - story, what's in the set, price, WhatsApp (number + a
 * tappable wa.me link with a prefilled keyword) and a comment question.
 */
export function hookPhotoCaption(f: PostFields): string {
  const number = (f.whatsapp ?? "").trim();
  const wa = waNumber(number);
  const keyword = (f.waKeyword ?? "").trim();
  const link = wa ? `https://wa.me/${wa}${keyword ? `?text=${encodeURIComponent(keyword)}` : ""}` : "";
  const offer = [f.price?.trim() ? `💰 සම්පූර්ණ කට්ටලයම ${f.price.trim()}ට පමණයි` : "", f.offerNote?.trim() ? `(${f.offerNote.trim()})` : ""]
    .filter(Boolean)
    .join(" ");

  return [
    (f.captionHook ?? "").trim() || plainHook(f.hook ?? ""),
    f.pointer?.trim() ? `👇 ${f.pointer.trim()}. Save කරගන්න, පස්සේ බලන්න පුළුවන්.` : "",
    "",
    POST_CONTENT_PLACEHOLDER,
    "",
    "━━━━━━━━━━━━━━━",
    "🔥 ඉංග්‍රීසි Next level එකට ගේන්න කැමතිද? 🔥",
    "",
    (f.story ?? "").trim(),
    "",
    "📚 StudyPal ඉංග්‍රීසි පොත් කට්ටලය",
    "✅ පොත් 10 · වෙළුම් 69 · වාක්‍ය 21,000+",
    "✅ හැම වාක්‍යයකටම සිංහල අකුරෙන් උච්චාරණය සහ තේරුම",
    "✅ ගෙදරට, රස්සාවට, විදේශ ගමනට - හැම තැනටම",
    "✅ PDF පොත් WhatsApp එකෙන්ම ලැබේ",
    "",
    offer,
    number ? `📲 WhatsApp: ${number}` : "",
    link ? `👉 මෙතන click කරලා කෙලින්ම message කරන්න: ${link}` : "",
    "",
    (f.commentQuestion ?? "").trim() ? `💬 ${f.commentQuestion.trim()}` : "",
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const studyPalHookPhoto: PostTemplateDef = {
  id: "studypal-hook-photo",
  name: "Hook photo + long caption",
  description: "1080×1350 · a photo with one big Sinhala hook box; the content and the offer go in the caption",
  width: W,
  height: H,
  fields: [
    { key: "image", label: "Background photo", type: "image", hint: "Upload, paste a URL, or search free photos below. Empty = a plain brand background." },
    { key: "imageZoom", label: "Photo zoom", type: "range", min: 100, max: 400, step: 5, unit: "%" },
    { key: "imageX", label: "Photo position - left / right", type: "range", min: 0, max: 100, unit: "%", hint: "Which part of the photo to show (and zoom into): 0 = left edge, 100 = right edge." },
    { key: "imageY", label: "Photo position - up / down", type: "range", min: 0, max: 100, unit: "%" },
    { key: "overlayOpacity", label: "Dark overlay", type: "range", min: 0, max: 90, unit: "%", hint: "Darkens a bright photo so the box and pills stand out. Color under Colors (Photo overlay)." },
    { key: "offsetY", label: "Vertical position", type: "range", min: 0, max: 100, unit: "%", hint: "Moves the pills and the box together: 0 = top, 100 = bottom. Keep the photo's subject clear." },
    { key: "topPill", label: "Top pill (above the box)", type: "text", lang: "si", hint: "Empty hides it." },
    { key: "boxOpacity", label: "Hook box opacity", type: "range", min: 20, max: 100, unit: "%", hint: "Lower lets the photo show through the box." },
    { key: "hookSize", label: "Hook text size", type: "range", min: 36, max: 130, unit: "px", hint: "Shrinks automatically if a line wouldn't fit the box at this size." },
    { key: "hook", label: "Hook (in the box)", type: "textarea", lang: "si", hint: "Wrap a word in **double stars** to highlight it, e.g. **300**. Auto-shrinks to fit." },
    { key: "pointer", label: "Bottom pill (under the box)", type: "text", lang: "si", hint: "Sends people into the caption. Empty hides it." },
    { key: "brand", label: "Brand mark (bottom left)", type: "text", hint: "Empty hides it." },
    { key: "imageWhatsapp", label: "WhatsApp on the image (bottom right)", type: "text", hint: "Empty hides it." },
    { key: "captionHook", label: "Caption: first line", type: "textarea", lang: "si", hint: "Empty = the hook. This and the pointer line are all that show before \"See more\"." },
    { key: "story", label: "Caption: your story", type: "textarea", lang: "si" },
    { key: "price", label: "Caption: price", type: "text" },
    { key: "offerNote", label: "Caption: offer note", type: "text", lang: "si", hint: "e.g. the deadline. Empty hides it." },
    { key: "whatsapp", label: "Caption: WhatsApp number", type: "text" },
    { key: "waKeyword", label: "Caption: prefilled WhatsApp message", type: "text", hint: "The wa.me link opens WhatsApp with this typed in - one tap to send. Empty = no prefill." },
    { key: "commentQuestion", label: "Caption: closing question", type: "text", lang: "si", hint: "Invites comments. Empty hides it." },
  ],
  colors: [
    { key: "boxBg", label: "Hook box" },
    { key: "boxText", label: "Hook text" },
    { key: "highlight", label: "Highlighted words (**...**)" },
    { key: "pillBg", label: "Pointer pill" },
    { key: "pillText", label: "Pointer text" },
    { key: "overlay", label: "Photo overlay" },
    { key: "shade", label: "Photo shade (edges)" },
    { key: "brandTile", label: "Logo tile" },
    { key: "brandInk", label: "Logo mark" },
    { key: "fallback", label: "Background (no photo)" },
  ],
  defaultFields: {
    image: "",
    imageZoom: "100",
    imageX: "50",
    imageY: "50",
    overlayOpacity: "0",
    boxOpacity: "100",
    hookSize: "80",
    hook: "ඉංග්‍රීසි කතා කරන්න බැරි නම්\nමේ වාක්‍ය **300** එක්ක හැමදාම\nකතා කරන්න පුරුදු වෙන්න",
    offsetY: "50",
    topPill: "වාක්‍ය 300ම ඉහලින්",
    pointer: "වාක්‍ය 300ම පහළින්",
    brand: "StudyPal",
    imageWhatsapp: "078 44 89 045",
    captionHook: "",
    story:
      "මමත් ඉංග්‍රීසි වාක්‍ය රටා ඉගෙන ගත්තේ තනියම. හරි තේරුම් හොයාගන්න ගොඩක් කට්ට කෑවා. මේ පොත් වල තියෙන්නේ ඒ ගමනේදී මම හදාගත්ත දැනුමයි - ඒ නිසා ඔයාට ඒ කරදර එන්නේ නෑ.",
    price: "රු. 1000",
    offerNote: "ඔක්. 8 දක්වා",
    whatsapp: "078 44 89 045",
    waKeyword: "BOOKS",
    commentQuestion: "මේ වාක්‍ය වලින් ඔයා අදම පාවිච්චි කරන්නේ මොකක්ද? Comment එකේ ලියන්න 👇",
  },
  defaultColors: {
    boxBg: "#FFF03A",
    boxText: "#111111",
    highlight: "#111111",
    pillBg: "#111111",
    pillText: "#FFFFFF",
    overlay: "#000000",
    shade: "#000000",
    brandTile: "#F9B200",
    brandInk: "#591F82",
    fallback: "#591F82",
  },
  colorsFromPalette: (p) => ({
    boxBg: "#FFF03A",
    boxText: "#111111",
    highlight: p.primary,
    pillBg: "#111111",
    pillText: "#FFFFFF",
    overlay: "#000000",
    shade: "#000000",
    brandTile: p.gold,
    brandInk: p.primary,
    fallback: p.primary,
  }),
  suggestCaption: (f) => hookPhotoCaption(f),
  captionContext: (f) => ({ format: "quote", topic: null, items: [], extraText: [f.topPill, plainHook(f.hook ?? ""), f.pointer].filter(Boolean) }),
  loadFonts: loadPostFonts,
  component: StudyPalHookPhoto,
};
