import { defaultConfig } from "../../src/config/config";
import { loadManifest } from "../../src/render/manifest";
import { getPhrasesByIds } from "../../src/data/getPhrases";
import { resolveDefaultConfig } from "../settings";
import { aiStatus } from "../ai/client";
import { aiCaptions } from "./ai";
import { builtinCaption } from "./builtin";
import type { PublishSource } from "../distribution/media";
import type { CaptionContext, CaptionOptions, CaptionPlatform, CaptionSuggestion, PlatformCaption } from "../../src/captions/types";

/**
 * Caption suggestions for the Publish panel. The built-in engine always
 * works; AI is an extra that's only tried when asked for and a key is set,
 * and any AI failure (no key, expired, rate limit, bad answer, spoiler)
 * silently falls back to the built-in engine with the reason attached.
 */

export { aiStatus };

/** A batch reel's content comes from the manifest + phrase DB; a post's content is described by the GUI (its template's captionContext). */
async function contextForSource(source: PublishSource, given: CaptionContext | undefined): Promise<CaptionContext> {
  if (source.type === "post") {
    if (!given) throw new Error("A post needs its caption context");
    return given;
  }
  const entry = Object.values(loadManifest(defaultConfig.manifestPath)).find((e) => e.batchId === source.batchId && e.template === source.template);
  if (!entry) throw new Error(`No rendered reel for batch ${source.batchId} (template ${source.template})`);
  const phrases = await getPhrasesByIds(entry.phraseIds);
  const byId = new Map(phrases.map((p) => [p.id, p]));
  return {
    kind: "reel",
    // Template 3 ("Reversed") shows the Sinhala and asks for the English.
    format: source.template === "3" ? "reversed" : "quiz",
    topic: entry.chapterTitle,
    items: entry.phraseIds
      .map((id) => byId.get(id))
      .filter((p) => p != null)
      .map((p) => ({ english: p.phrase, sinhala: p.translationSi, pronunciation: p.pronunciationSi, explanation: p.explanation })),
  };
}

function seedFor(source: PublishSource): string {
  return source.type === "post" ? `post:${source.savedPath}` : `batch:${source.template}:${source.batchId}`;
}

/** The quiz only works if the answer stays in the video - reject AI captions that give it away. */
function spoilerIn(ctx: CaptionContext, caption: string): string | null {
  const text = caption.toLowerCase();
  for (const it of ctx.items) {
    const answer = ctx.format === "quiz" ? it.sinhala : ctx.format === "reversed" ? it.english : null;
    if (answer && answer.trim().length >= 3 && text.includes(answer.trim().toLowerCase())) return answer.trim();
  }
  return null;
}

export interface SuggestRequest {
  source: PublishSource;
  context?: CaptionContext;
  platforms: CaptionPlatform[];
  options: CaptionOptions;
  engine: "builtin" | "ai";
}

export async function suggestCaptions(req: SuggestRequest): Promise<CaptionSuggestion> {
  const ctx = await contextForSource(req.source, req.context);
  const ctaUrl = resolveDefaultConfig(defaultConfig).ctaUrl;
  const seed = seedFor(req.source);

  const builtin = (): CaptionSuggestion["captions"] =>
    Object.fromEntries(req.platforms.map((p) => [p, builtinCaption(ctx, p, req.options, seed, ctaUrl)]));

  if (req.engine !== "ai") return { engine: "builtin", captions: builtin() };

  let fallbackReason: string;
  if (!aiStatus().available) {
    fallbackReason = "No AI key is set, so these are the built-in suggestions.";
  } else {
    try {
      const captions: Partial<Record<CaptionPlatform, PlatformCaption>> = await aiCaptions(ctx, req.platforms, req.options, ctaUrl);
      const spoiled = Object.values(captions)
        .map((c) => spoilerIn(ctx, `${c!.title ?? ""}\n${c!.caption}`))
        .find(Boolean);
      if (spoiled) throw new Error(`the AI caption gave away the answer ("${spoiled}")`);
      const fallback = builtin();
      const missing = req.platforms.filter((p) => !captions[p]);
      return {
        engine: "ai",
        captions: { ...fallback, ...captions },
        fallbackReason: missing.length ? `AI skipped ${missing.join(", ")} - built-in caption used there.` : undefined,
      };
    } catch (err) {
      console.warn("[captions] AI failed, using built-in:", err);
      fallbackReason = `AI unavailable: ${err instanceof Error ? err.message : String(err)}. Showing built-in suggestions instead.`;
    }
  }
  return { engine: "builtin", captions: builtin(), fallbackReason };
}
