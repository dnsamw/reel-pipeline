import { hexToRgba } from "./PostReady";
import { postFonts } from "./fonts";
import { WhatsAppMark } from "./WhatsAppMark";
import type { PostFields } from "./types";

/**
 * The mobile number drawn over every post (Post Creator, Vocab Post, Sentence
 * Post) - so it's in the PNG and in the reel made from it. Not part of any
 * template: PostStill and the GUI's PostPreview draw it on top, from these
 * fields, which the GUI fills from one setting shared by every post page
 * (gui ContactCard). Empty number = nothing drawn.
 */
export const CONTACT_KEYS = [
  "contactPhone",
  "contactLabel",
  "contactX",
  "contactY",
  "contactSize",
  "contactBg",
  "contactBgOpacity",
  "contactLabelColor",
  "contactText",
  "contactIconBg",
  "contactIconInk",
] as const;

/** StudyPal brand colors - the same gold and purple as the StudyPal logo mark. */
export const contactBrandColors: PostFields = {
  contactBg: "#591F82",
  contactBgOpacity: "90",
  contactLabelColor: "#F9B200",
  contactText: "#FFFFFF",
  contactIconBg: "#F9B200",
  contactIconInk: "#591F82",
};

/** The first colors (black box, WhatsApp green icon) - saved settings still on these are moved to the brand colors. */
export const contactOldDefaultColors: PostFields = {
  contactBg: "#000000",
  contactBgOpacity: "82",
  contactLabelColor: "#FFFFFF",
  contactText: "#FFFFFF",
  contactIconBg: "#25D366",
  contactIconInk: "#FFFFFF",
};

export const contactDefaults: PostFields = {
  contactPhone: "",
  contactLabel: "WhatsApp",
  contactX: "50",
  contactY: "100",
  contactSize: "40",
  ...contactBrandColors,
};

export function ContactBadge({ fields }: { fields: PostFields }) {
  const phone = (fields.contactPhone ?? "").trim();
  if (!phone) return null;
  const num = (v: string | undefined, fallback: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v === undefined || v === "" ? fallback : Number(v) || 0));
  const x = num(fields.contactX, 50, 0, 100);
  const y = num(fields.contactY, 100, 0, 100);
  const size = num(fields.contactSize, 40, 20, 90);
  const label = (fields.contactLabel ?? "").trim();
  // 0 = no box - just the icon and text on the image, like the StudyPal logo mark.
  const bgOpacity = num(fields.contactBgOpacity, 90, 0, 100) / 100;
  // The sliders reach the post's own edges (a small margin, not the Reels safe zones) - you choose
  // where it goes, even if that's under the Reels caption bar.
  const margin = 24;

  return (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        top: margin,
        bottom: margin,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-${x}%, -${y}%)`,
          display: "flex",
          alignItems: "center",
          gap: size * 0.35,
          padding: `${size * 0.3}px ${size * 0.7}px ${size * 0.3}px ${size * 0.4}px`,
          borderRadius: 999,
          background: hexToRgba(fields.contactBg || contactBrandColors.contactBg, bgOpacity),
          color: fields.contactText || "#FFFFFF",
          // Without much of a box, a soft shadow keeps the text readable on any image.
          textShadow: bgOpacity < 0.4 ? `0 2px 10px ${hexToRgba("#000000", 0.5)}` : undefined,
          fontFamily: postFonts.display,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.2,
          whiteSpace: "nowrap",
        }}
      >
        <WhatsAppMark size={size * 1.3} bubble={fields.contactIconBg || contactBrandColors.contactIconBg} handset={fields.contactIconInk || contactBrandColors.contactIconInk} />
        <span>
          {label && <span style={{ fontWeight: 600, color: fields.contactLabelColor || contactBrandColors.contactLabelColor }}>{label} </span>}
          {phone}
        </span>
      </div>
    </div>
  );
}
