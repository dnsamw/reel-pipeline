import { getProduct } from "./products";
import { DEFAULT_MOCKUP_ADJUST, resolveAdColors, resolveAdFields, type AdFormat, type AdMockupAdjust, type AdTemplateDef } from "./types";
import type { PostFields, PostLists } from "../posts/types";

export interface AdContent {
  format: AdFormat;
  /** Product code - B01..B10, PKSTART..., ALL. */
  product: string;
  fields: PostFields;
  lists: PostLists;
  /** Overrides only - empty/missing keys use the product's colors. */
  colors: Record<string, string>;
  mockup: Partial<AdMockupAdjust>;
}

/**
 * Renders an ad template with its fallbacks applied (auto fields, product
 * colors, default lists). The single entry point both the GUI preview and the
 * "Ad" still (AdStill.tsx) go through, so the PNG matches the preview.
 */
export function AdCanvas({ def, format, product, fields, lists, colors, mockup }: AdContent & { def: AdTemplateDef }) {
  const p = getProduct(def.productKind, product);
  const Component = def.component;
  return (
    <Component
      format={def.formats.includes(format) ? format : def.formats[0]}
      product={p}
      fields={resolveAdFields(def, p, fields)}
      lists={{ ...def.defaultLists, ...lists }}
      colors={resolveAdColors(def, p, colors)}
      mockup={{ ...DEFAULT_MOCKUP_ADJUST, ...mockup }}
    />
  );
}
