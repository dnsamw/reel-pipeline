import { adS1CoverHero } from "./templates/AdS1CoverHero";
import { adS2PeekInside } from "./templates/AdS2PeekInside";
import { adM1PackHero } from "./templates/AdM1PackHero";
import { adC1TheShelf } from "./templates/AdC1TheShelf";
import { adC2TheOffer } from "./templates/AdC2TheOffer";
import type { AdTemplateDef } from "./types";

/**
 * Every ad template the Ad Creator (gui /ad-creator) and the "Ad" still
 * composition (Root.tsx -> AdStill.tsx) know about. To add one: port the
 * HTML design from ad-templates/ into templates/<Name>.tsx exporting an
 * AdTemplateDef (shared runtime in AdKit.tsx), then append it here.
 */
export const adTemplates: AdTemplateDef[] = [adS1CoverHero, adS2PeekInside, adM1PackHero, adC1TheShelf, adC2TheOffer];

export function getAdTemplate(id: string): AdTemplateDef | undefined {
  return adTemplates.find((t) => t.id === id);
}
