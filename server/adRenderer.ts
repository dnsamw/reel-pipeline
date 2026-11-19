import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAdTemplate } from "../src/ads/registry";
import { getProduct } from "../src/ads/products";
import { AD_FORMATS, adFileBase, resolveAdColors, type AdFormat, type AdMockupAdjust } from "../src/ads/types";
import type { PostFields, PostLists } from "../src/posts/types";
import { inlineAssetImage, renderStillPng } from "./postRenderer";
import { encodeStillReel, resolveMusicTrack, type PostReelOptions } from "./postReel";

export const ADS_OUTPUT_DIR = join(process.cwd(), "output", "ads");

export interface AdRenderInput {
  templateId: string;
  format: AdFormat;
  product: string;
  fields: PostFields;
  lists: PostLists;
  colors: Record<string, string>;
  mockup: Partial<AdMockupAdjust>;
  /** Last part of the file name - "v1", "v2"... */
  variant: string;
}

/**
 * Renders an ad to PNG with the "Ad" still (src/ads/AdStill.tsx) - the same
 * AdCanvas the Ad Creator previews - and saves it under output/ads/ with the
 * ads plan's file name, {TEMPLATE}_{PRODUCT}_{FORMAT}_{VARIANT}.png
 * (re-exporting a variant replaces it).
 */
export async function renderAdPng(input: AdRenderInput): Promise<{ png: Buffer; savedPath: string; width: number; height: number }> {
  const def = getAdTemplate(input.templateId);
  if (!def) throw new Error(`Unknown ad template "${input.templateId}"`);
  if (!AD_FORMATS[input.format] || !def.formats.includes(input.format)) throw new Error(`${def.code} has no "${input.format}" format`);
  const product = getProduct(def.productKind, input.product);

  const fields: PostFields = { ...def.defaultFields, ...input.fields };
  for (const f of def.fields) if (f.type === "image") fields[f.key] = inlineAssetImage(fields[f.key] ?? "");

  const { png, width, height } = await renderStillPng("Ad", {
    templateId: def.id,
    format: input.format,
    product: product.code,
    fields,
    lists: { ...def.defaultLists, ...input.lists },
    colors: input.colors ?? {},
    mockup: input.mockup ?? {},
  });

  mkdirSync(ADS_OUTPUT_DIR, { recursive: true });
  const savedPath = join(ADS_OUTPUT_DIR, `${adFileBase(def, product.code, input.format, input.variant)}.png`);
  writeFileSync(savedPath, png);
  return { png, savedPath, width, height };
}

/** The ad as a still-image MP4 over a music track (same encoder as Post Creator reels), saved next to its PNG. */
export async function renderAdReel(input: AdRenderInput, opts: PostReelOptions): Promise<{ mp4Path: string }> {
  const musicPath = resolveMusicTrack(opts.musicFile);
  const def = getAdTemplate(input.templateId);
  if (!def) throw new Error(`Unknown ad template "${input.templateId}"`);
  const { savedPath: pngPath, width, height } = await renderAdPng(input);
  const colors = resolveAdColors(def, getProduct(def.productKind, input.product), input.colors ?? {});
  return encodeStillReel({ pngPath, width, height, background: def.backgroundColor(colors) }, opts, musicPath);
}
