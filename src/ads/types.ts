import type { ComponentType } from "react";
import type { PostColorDef, PostFields, PostListFieldDef, PostLists, PostScalarFieldDef } from "../posts/types";
import type { AdProduct, AdProductKind } from "./products";

/** Ad sizes from the ads plan (Part 5) - the code is also the file-name format code. */
export type AdFormat = "SQ" | "PT" | "ST";

export const AD_FORMATS: Record<AdFormat, { width: number; height: number; label: string }> = {
  SQ: { width: 1080, height: 1080, label: "Square 1:1" },
  PT: { width: 1080, height: 1350, label: "Portrait 4:5" },
  ST: { width: 1080, height: 1920, label: "Story 9:16" },
};

export const AD_FORMAT_ORDER: AdFormat[] = ["PT", "ST", "SQ"];

/**
 * A field whose empty value falls back to something derived from the product
 * (e.g. S1's hook "" = that book's copy-bank hook) - the same rule as the
 * HTML designs' CONFIG ("" = default). The GUI shows the fallback as the
 * input's placeholder.
 */
type WithAuto<T> = T & {
  auto?: (product: AdProduct, fields: PostFields) => string;
  /** Display-only: what the template renders for an empty value when that isn't plain text (e.g. a line with bold parts) - not applied by resolveAdFields. */
  placeholder?: (product: AdProduct, fields: PostFields) => string;
};

export type AdScalarFieldDef = WithAuto<PostScalarFieldDef>;
export type AdFieldDef = AdScalarFieldDef | PostListFieldDef;

/** Per-ad mockup nudges (the HTML's mockupScale/X/Y/Rotate) - px and degrees, applied to the main mockup image only. */
export interface AdMockupAdjust {
  scale: number;
  x: number;
  y: number;
  rotate: number;
}

export const DEFAULT_MOCKUP_ADJUST: AdMockupAdjust = { scale: 1, x: 0, y: 0, rotate: 0 };

export interface AdTemplateProps {
  format: AdFormat;
  product: AdProduct;
  /** Already resolved - every `auto` fallback applied. */
  fields: PostFields;
  lists: PostLists;
  /** Already resolved - the product's colors with any overrides on top. */
  colors: Record<string, string>;
  mockup: AdMockupAdjust;
}

export interface AdTemplateDef {
  id: string;
  /** Template code from the ads plan catalog (Part 9) - first part of the export file name, e.g. "S1". */
  code: string;
  name: string;
  description: string;
  /** Funnel stage from the catalog - shown in the picker. */
  funnel: string;
  /** Which products this template advertises - drives the product picker. */
  productKind: AdProductKind;
  defaultProduct: string;
  formats: AdFormat[];
  fields: AdFieldDef[];
  defaultFields: PostFields;
  defaultLists?: PostLists;
  colors: PostColorDef[];
  /** The colors an ad starts with for a product - overrides in the GUI sit on top. */
  colorsFor: (product: AdProduct) => Record<string, string>;
  /** Fill for the letterbox bars when a non-9:16 ad is exported as a 9:16 video. */
  backgroundColor: (colors: Record<string, string>) => string;
  component: ComponentType<AdTemplateProps>;
}

/** Field values with every `auto` fallback applied - what the template component renders. */
export function resolveAdFields(def: AdTemplateDef, product: AdProduct, fields: PostFields): PostFields {
  const merged = { ...def.defaultFields, ...fields };
  const out: PostFields = { ...merged };
  for (const f of def.fields) {
    if (f.type === "list" || out[f.key] || !f.auto) continue;
    out[f.key] = f.auto(product, merged);
  }
  return out;
}

/** The product's colors with non-empty overrides on top. */
export function resolveAdColors(def: AdTemplateDef, product: AdProduct, overrides: Record<string, string>): Record<string, string> {
  const out = { ...def.colorsFor(product) };
  for (const [k, v] of Object.entries(overrides)) if (v) out[k] = v;
  return out;
}

/** Export file name from the ads plan's naming convention (Part 4.5): {TEMPLATE}_{PRODUCT}_{FORMAT}_{VARIANT}. */
export function adFileBase(def: AdTemplateDef, productCode: string, format: AdFormat, variant: string): string {
  const v = (variant || "v1").replace(/[^A-Za-z0-9-]/g, "") || "v1";
  return `${def.code}_${productCode}_${format}_${v}`;
}
