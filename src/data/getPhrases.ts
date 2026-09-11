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

export async function disconnect() {
  await prisma.$disconnect();
}
