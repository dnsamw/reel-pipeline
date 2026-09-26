import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { hexToRgba, mixHex, resolvePostAsset, usePostHold } from "../PostReady";
import { useFitFontSize } from "../useFitFontSize";
import { loadPostFonts, postFonts } from "../fonts";
import { StudyPalLogo } from "../StudyPalLogo";
import type { PostTemplateDef, PostTemplateProps } from "../types";

/**
 * React port of post-templates/facebook-post-template.html - 1080x1080,
 * brand bar + big shrink-to-fit headline + Sinhala line + footer, with an
 * optional full-bleed photo (the HTML's "With image" mode) that pushes the
 * text to the bottom over a gradient shade.
 */
function StudyPalQuote({ fields, colors }: PostTemplateProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const hold = usePostHold();

  const imgSrc = resolvePostAsset(fields.image ?? "");
  const hasImage = !!imgSrc;

  useFitFontSize(boxRef, headRef, { max: hasImage ? 104 : 132, min: 44 }, [fields.headline, fields.sinhala, hasImage]);

  // Block a render capture until the photo is actually decoded - otherwise
  // renderStill can screenshot an empty <img>.
  useLayoutEffect(() => {
    const img = imgRef.current;
    if (!img || !imgSrc || img.complete) return;
    const release = hold("post: load image");
    img.addEventListener("load", release, { once: true });
    img.addEventListener("error", release, { once: true });
    return release;
  }, [imgSrc, hold]);

  const c = colors;
  const pad = 72;

  const root: CSSProperties = {
    width: 1080,
    height: 1080,
    position: "relative",
    overflow: "hidden",
    background: c.background,
    color: c.accent,
    fontFamily: postFonts.body,
  };
  const fill: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%" };

  return (
    <div style={root}>
      {hasImage && (
        <>
          <img ref={imgRef} src={imgSrc} alt="" style={{ ...fill, objectFit: "cover" }} />
          <div
            style={{
              ...fill,
              background: [
                `linear-gradient(180deg, ${hexToRgba(c.backgroundDeep, 0.75)} 0%, ${hexToRgba(c.backgroundDeep, 0)} 22%)`,
                `linear-gradient(180deg, ${hexToRgba(c.backgroundDeep, 0)} 35%, ${hexToRgba(c.backgroundDeep, 0.82)} 68%, ${hexToRgba(c.backgroundDeep, 0.97)} 100%)`,
              ].join(", "),
            }}
          />
        </>
      )}

      {/* Brand bar */}
      <div style={{ position: "absolute", top: 64, left: pad, right: pad, display: "flex", alignItems: "center", gap: 18, zIndex: 2 }}>
        <StudyPalLogo size={68} tile={c.accent} ink={c.background} />
        <span style={{ fontFamily: postFonts.display, fontWeight: 700, fontSize: 38, letterSpacing: "-0.01em", color: c.text }}>
          {fields.brand}
        </span>
        {fields.kicker && (
          <span
            style={{
              marginLeft: "auto",
              padding: "12px 26px",
              borderRadius: 99,
              background: c.accent,
              color: c.onAccent,
              fontFamily: postFonts.display,
              fontWeight: 700,
              fontSize: 28,
            }}
          >
            {fields.kicker}
          </span>
        )}
      </div>

      {/* Text block */}
      <div
        ref={boxRef}
        style={{
          position: "absolute",
          left: pad,
          right: pad,
          top: hasImage ? 480 : 190,
          bottom: hasImage ? 140 : 150,
          display: "flex",
          flexDirection: "column",
          justifyContent: hasImage ? "flex-end" : "center",
          zIndex: 2,
        }}
      >
        {/* fontSize is set by useFitFontSize, deliberately not here */}
        <h1
          ref={headRef}
          style={{
            margin: 0,
            fontFamily: postFonts.display,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
            color: c.accent,
            textWrap: "balance",
            overflowWrap: "break-word",
          } as CSSProperties}
        >
          {fields.headline}
        </h1>
        {fields.sinhala && (
          <p lang="si" style={{ margin: "28px 0 0", fontFamily: postFonts.sinhala, fontWeight: 600, fontSize: 44, lineHeight: 1.45, color: c.text }}>
            {fields.sinhala}
          </p>
        )}
      </div>

      {/* Footer */}
      {fields.footer && (
        <div
          style={{
            position: "absolute",
            left: pad,
            right: pad,
            bottom: 62,
            display: "flex",
            alignItems: "center",
            gap: 18,
            zIndex: 2,
            fontSize: 30,
            fontWeight: 600,
            color: c.mutedText,
          }}
        >
          <span style={{ width: 64, height: 8, borderRadius: 4, background: c.accent, flex: "none" }} />
          {fields.footer}
        </div>
      )}
    </div>
  );
}

export const studyPalQuote: PostTemplateDef = {
  id: "studypal-quote",
  name: "StudyPal quote",
  description: "1080×1080 · headline + Sinhala line, optional background photo",
  width: 1080,
  height: 1080,
  fields: [
    { key: "kicker", label: "Kicker (pill, top right)", type: "text", hint: "Empty hides the pill" },
    { key: "headline", label: "Headline", type: "textarea", hint: "Auto-shrinks to fit" },
    { key: "sinhala", label: "Sinhala line", type: "textarea", lang: "si" },
    { key: "footer", label: "Footer", type: "text" },
    { key: "brand", label: "Brand name", type: "text" },
    { key: "image", label: "Background photo", type: "image", hint: "Optional - moves the text to the bottom over a shade" },
  ],
  colors: [
    { key: "background", label: "Background" },
    { key: "backgroundDeep", label: "Background deep (photo shade)" },
    { key: "accent", label: "Accent (headline, pill, logo)" },
    { key: "onAccent", label: "Text on accent" },
    { key: "text", label: "Text" },
    { key: "mutedText", label: "Footer text" },
  ],
  defaultFields: {
    kicker: "Word of the day",
    headline: "Don't just learn English. Start speaking it.",
    sinhala: "ඉංග්‍රීසි ඉගෙනගන්න විතරක් නෙවෙයි, කතා කරන්නත් පටන් ගන්න.",
    footer: "Follow StudyPal for daily English",
    brand: "StudyPal",
    image: "",
  },
  defaultColors: {
    background: "#591f82",
    backgroundDeep: "#3b1259",
    accent: "#f9b200",
    onAccent: "#3b1259",
    text: "#ffffff",
    // rgba(255,255,255,.85) from the HTML, pre-blended over the purple so it
    // stays a plain hex the color inputs can edit.
    mutedText: "#e6ddec",
  },
  colorsFromPalette: (p, variant) => {
    if (variant === "light") {
      // Brand look: primary as the field, gold accents, white type - how the
      // original HTML design reads.
      const deep = mixHex(p.primary, "#000000", 0.35);
      return {
        background: p.primary,
        backgroundDeep: deep,
        accent: p.gold,
        onAccent: deep,
        text: "#ffffff",
        mutedText: mixHex("#ffffff", p.primary, 0.15),
      };
    }
    // Dark look: the palette's own dark surface instead of a purple field.
    return {
      background: p.background,
      backgroundDeep: mixHex(p.background, "#000000", 0.4),
      accent: p.gold,
      onAccent: p.background,
      text: p.foreground,
      mutedText: p.mutedForeground,
    };
  },
  loadFonts: loadPostFonts,
  component: StudyPalQuote,
};
