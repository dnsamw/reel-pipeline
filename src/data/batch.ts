import type { Phrase } from "./phrase";

export interface ReelBatch {
  /** Deterministic id derived from the phrase ids it contains - used as the manifest key. */
  id: string;
  chapterId: string;
  chapterTitle: string;
  chapterOrder: number;
  phrases: Phrase[];
}

/**
 * Groups phrases into per-reel batches of `size`, never mixing phrases
 * from two different chapters into the same reel. A trailing partial
 * batch (fewer than `size` phrases left in a chapter) is still emitted -
 * better to ship a short reel than drop phrases.
 */
export function batchPhrases(phrases: Phrase[], size: number): ReelBatch[] {
  const batches: ReelBatch[] = [];

  const byChapter = new Map<string, Phrase[]>();
  for (const phrase of phrases) {
    const list = byChapter.get(phrase.chapterId) ?? [];
    list.push(phrase);
    byChapter.set(phrase.chapterId, list);
  }

  for (const [chapterId, chapterPhrases] of byChapter) {
    for (let i = 0; i < chapterPhrases.length; i += size) {
      const slice = chapterPhrases.slice(i, i + size);
      batches.push({
        id: slice.map((p) => p.id).join("-"),
        chapterId,
        chapterTitle: slice[0].chapterTitle,
        chapterOrder: slice[0].chapterOrder,
        phrases: slice,
      });
    }
  }

  return batches;
}
