import { createContext, useContext, type ReactNode } from "react";

/**
 * The few fixed words on every reel: the label at the top of each scene and
 * the outro's heading and line. The English phrase reels keep these
 * defaults; Planner reels for Japanese, Korean, grammar and the monk book
 * set their own through the reel config (brandLabel, outroHeading, outroSub).
 */
export interface BrandText {
  label: string;
  outroHeading: string;
  outroSub: string;
}

export const DEFAULT_BRAND_TEXT: BrandText = {
  label: "StudyPal Phrasebook",
  outroHeading: "Get the full phrasebook",
  outroSub: "200+ everyday English phrases with Sinhala pronunciation & meaning",
};

const BrandTextContext = createContext<BrandText>(DEFAULT_BRAND_TEXT);

export function BrandTextProvider({ value, children }: { value: Partial<BrandText>; children: ReactNode }) {
  const merged: BrandText = {
    label: value.label || DEFAULT_BRAND_TEXT.label,
    outroHeading: value.outroHeading || DEFAULT_BRAND_TEXT.outroHeading,
    outroSub: value.outroSub || DEFAULT_BRAND_TEXT.outroSub,
  };
  return <BrandTextContext.Provider value={merged}>{children}</BrandTextContext.Provider>;
}

export const useBrandText = () => useContext(BrandTextContext);
