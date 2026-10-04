import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Free stock photos for post backgrounds, via the Pexels API
 * (https://www.pexels.com/api/ - free key, photos free for commercial use,
 * no attribution required). Optional: without PEXELS_API_KEY in .env the
 * GUI just shows how to enable it. Picked photos are downloaded into
 * assets/images/ so renders don't depend on Pexels being reachable.
 */

export interface StockPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  pageUrl: string;
  thumb: string;
  /** Full-size source - pass back to importStockPhoto. */
  src: string;
}

const key = () => process.env.PEXELS_API_KEY?.trim() ?? "";

export const stockStatus = () => ({ available: !!key(), provider: "Pexels" });

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  alt: string;
  photographer: string;
  url: string;
  src: { original: string; medium: string };
}

export async function searchStockPhotos(query: string, page: number, orientation?: string): Promise<{ photos: StockPhoto[]; hasMore: boolean }> {
  if (!key()) throw Object.assign(new Error("Add PEXELS_API_KEY to .env to search free photos"), { status: 400 });
  const params = new URLSearchParams({ query, page: String(page), per_page: "24" });
  if (orientation === "portrait" || orientation === "landscape" || orientation === "square") params.set("orientation", orientation);
  const res = await fetch(`https://api.pexels.com/v1/search?${params}`, { headers: { Authorization: key() } });
  if (!res.ok) throw Object.assign(new Error(`Pexels: ${res.status} ${res.statusText}`), { status: 502 });
  const body = (await res.json()) as { photos: PexelsPhoto[]; next_page?: string };
  return {
    photos: body.photos.map((p) => ({
      id: p.id,
      width: p.width,
      height: p.height,
      alt: p.alt,
      photographer: p.photographer,
      pageUrl: p.url,
      thumb: p.src.medium,
      src: p.src.original,
    })),
    hasMore: !!body.next_page,
  };
}

/** Downloads a picked photo (resized by Pexels' CDN to 1600px wide) into assets/images/ - returns the assets-relative path. */
export async function importStockPhoto(id: number, src: string): Promise<{ path: string }> {
  const url = new URL(src);
  if (url.hostname !== "images.pexels.com") throw Object.assign(new Error("Only images.pexels.com photos can be imported"), { status: 400 });
  url.search = new URLSearchParams({ auto: "compress", cs: "tinysrgb", w: "1600" }).toString();
  const res = await fetch(url);
  if (!res.ok) throw Object.assign(new Error(`Download failed: ${res.status}`), { status: 502 });
  const filename = `pexels-${Math.trunc(id) || Date.now()}.jpg`;
  const dir = join(process.cwd(), "assets", "images");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), Buffer.from(await res.arrayBuffer()));
  return { path: `images/${filename}` };
}
