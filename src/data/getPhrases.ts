import { PrismaClient } from "@prisma/client";
import type { Phrase } from "./phrase";

export type { Phrase };

const prisma = new PrismaClient();

/**
 * Fetches phrases ordered by chapter order, then phrase order within the
 * chapter - matches the order they appear in the book/PDF. Restricting to
 * a chapter order range lets a production run target only new chapters.
 *
 * `bookId` matters as soon as more than one Book row exists (e.g. a second
 * volume): BookChapter.order is only unique *within* a book, so without
 * this filter two books' "chapter 0" would be conflated by --chapters, and
 * every phrase from every book would be pulled together. Matches by exact
 * Book.id or a case-insensitive substring of Book.title, so
 * --book=<uuid-or-partial-title> both work.
 */
export async function getPhrases(
  chapterOrderRange: [number, number] | null = null,
  bookId: string | null = null,
): Promise<Phrase[]> {
  const chapters = await prisma.bookChapter.findMany({
    where: {
      ...(chapterOrderRange ? { order: { gte: chapterOrderRange[0], lte: chapterOrderRange[1] } } : {}),
      ...(bookId ? { book: { OR: [{ id: bookId }, { title: { contains: bookId, mode: "insensitive" } }] } } : {}),
    },
    orderBy: { order: "asc" },
    include: {
      phrases: { orderBy: { order: "asc" } },
    },
  });

  return chapters.flatMap((chapter) =>
    chapter.phrases.map((p) => ({
      id: p.id,
      phrase: p.phrase,
      translationSi: p.translationSi,
      pronunciationSi: p.pronunciationSi,
      explanation: p.explanation,
      explanationSi: p.explanationSi,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      chapterOrder: chapter.order,
      order: p.order,
    })),
  );
}

/** Node-only, used by the GUI server's "start render" screen to populate a book picker. */
export async function listBooks(): Promise<{ id: string; title: string }[]> {
  return prisma.book.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } });
}

/**
 * Chapter list (with phrase counts) for a book, or every book if `bookId` is
 * null - Node-only, used by the GUI server's "start render" screen to show a
 * live chapter picker instead of the user guessing --chapters values blind.
 */
export async function listChapters(bookId: string | null = null): Promise<
  { id: string; title: string; order: number; bookId: string; bookTitle: string; phraseCount: number }[]
> {
  const chapters = await prisma.bookChapter.findMany({
    where: bookId ? { book: { OR: [{ id: bookId }, { title: { contains: bookId, mode: "insensitive" } }] } } : {},
    orderBy: { order: "asc" },
    include: { book: { select: { id: true, title: true } }, _count: { select: { phrases: true } } },
  });

  return chapters.map((c) => ({
    id: c.id,
    title: c.title,
    order: c.order,
    bookId: c.book.id,
    bookTitle: c.book.title,
    phraseCount: c._count.phrases,
  }));
}

/**
 * Fetches specific phrases by id, in the order the ids were given - used by
 * renderBatch.ts's --phraseIds flag to render (or re-render) one exact reel
 * regardless of its position in a chapter, rather than the usual "chapter
 * range, grouped and skipped by manifest state" selection. Prisma's
 * `findMany({ where: { id: { in: ids } } })` does not preserve input order,
 * so results are re-sorted to match `ids` explicitly.
 */
export async function getPhrasesByIds(ids: string[]): Promise<Phrase[]> {
  const rows = await prisma.bookPhrase.findMany({
    where: { id: { in: ids } },
    include: { chapter: true },
  });
  const byId = new Map(rows.map((p) => [p.id, p]));
  return ids.map((id) => {
    const p = byId.get(id);
    if (!p) throw new Error(`Phrase not found: ${id}`);
    return {
      id: p.id,
      phrase: p.phrase,
      translationSi: p.translationSi,
      pronunciationSi: p.pronunciationSi,
      explanation: p.explanation,
      explanationSi: p.explanationSi,
      chapterId: p.chapter.id,
      chapterTitle: p.chapter.title,
      chapterOrder: p.chapter.order,
      order: p.order,
    };
  });
}

export interface PhraseContentEdit {
  phrase: string;
  translationSi: string | null;
  pronunciationSi: string | null;
  explanation: string;
  explanationSi: string | null;
}

/**
 * Updates a phrase's content fields directly in Postgres - the Review Queue
 * (GUI) uses this to correct a typo/mistranslation before or after
 * rendering. Deliberately narrow: only the fields a reviewer edits, never
 * chapterId/order/etc, so this can't be used to accidentally move a phrase
 * between chapters or corrupt its ordering. This is the one place in the
 * whole pipeline that writes to the shared StudyPal database rather than
 * only reading it - see docs/ARCHITECTURE.md's "Review Queue" section.
 */
export async function updatePhrase(id: string, fields: PhraseContentEdit): Promise<void> {
  await prisma.bookPhrase.update({ where: { id }, data: fields });
}

export async function disconnect() {
  await prisma.$disconnect();
}
