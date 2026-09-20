import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * One-off migration: pulls up to 200 phrases per chapter from eng_book_db
 * (the raw content-authoring DB) into study-pal-dev's Book/BookChapter/
 * BookPhrase tables (the shape the reel pipeline actually reads via
 * getPhrases.ts). Node-only - never imported from src/compositions/.
 *
 * eng_book_db has no Prisma schema of its own (see prisma/schema.prisma's
 * comment: it's trimmed to just the reel pipeline's models). Rather than
 * add a second generated client, this points a PrismaClient's
 * `datasourceUrl` at eng_book_db and uses $queryRaw, which bypasses the
 * model layer entirely - fine for a read-only, run-once script.
 *
 * Usage: npm run data:import-eng-book -- --eng-book-url=postgresql://postgres:PASSWORD@localhost:5433/eng_book_db
 * (or set ENG_BOOK_DB_URL in .env)
 */

const BOOK_ID = "6d7a28cf-5fe3-42b7-b8aa-e6a4d2b8a5ab"; // "The Ultimate Sinhala-to-English Phrasebook"
const PHRASES_PER_CHAPTER = 200;

// study-pal-dev BookChapter.order -> eng_book_db chapters.chapter_number.
// order 0 (chapter_number 1) is already fully seeded - intentionally
// omitted so reruns never touch it. order 1 maps to chapter_number 3
// ("Getting Things Done: Banks, Clinics, Hotels & Travel") by content
// match, not by a numeric offset - confirmed against study-pal-dev's
// existing "Travel කරද්දි අත්‍යාවශ්‍ය English" chapter title before writing
// this list. The remaining source chapters (no study-pal-dev chapter yet)
// are appended in ascending chapter_number order.
const CHAPTER_MAP: { order: number; sourceChapterNumber: number }[] = [
  { order: 1, sourceChapterNumber: 3 },
  { order: 2, sourceChapterNumber: 2 },
  { order: 3, sourceChapterNumber: 4 },
  { order: 4, sourceChapterNumber: 5 },
  { order: 5, sourceChapterNumber: 6 },
  { order: 6, sourceChapterNumber: 7 },
  { order: 7, sourceChapterNumber: 8 },
  { order: 8, sourceChapterNumber: 9 },
  { order: 9, sourceChapterNumber: 10 },
];

interface SourceEntry {
  phrase: string;
  translation: string;
  pronunciation: string;
  explanation_en: string;
  explanation_si: string;
}

interface SourceChapter {
  chapter_number: number;
  title_en: string;
}

async function main() {
  const urlArg = process.argv.find((a) => a.startsWith("--eng-book-url="));
  const sourceUrl = urlArg ? urlArg.slice("--eng-book-url=".length) : process.env.ENG_BOOK_DB_URL;
  if (!sourceUrl) {
    throw new Error("Pass --eng-book-url=postgresql://... or set ENG_BOOK_DB_URL in .env");
  }

  const source = new PrismaClient({ datasourceUrl: sourceUrl });
  const target = new PrismaClient();

  try {
    for (const { order, sourceChapterNumber } of CHAPTER_MAP) {
      const [sourceChapter] = await source.$queryRaw<SourceChapter[]>`
        SELECT chapter_number, title_en FROM chapters WHERE chapter_number = ${sourceChapterNumber}
      `;
      if (!sourceChapter) {
        console.warn(`No eng_book_db chapter with chapter_number=${sourceChapterNumber}, skipping order=${order}`);
        continue;
      }

      let chapter = await target.bookChapter.findFirst({ where: { bookId: BOOK_ID, order } });
      if (chapter) {
        const existingCount = await target.bookPhrase.count({ where: { chapterId: chapter.id } });
        if (existingCount > 0) {
          console.log(`order=${order} ("${chapter.title}") already has ${existingCount} phrases, skipping`);
          continue;
        }
      } else {
        // Raw INSERT, not target.bookChapter.create(): the real table (shared
        // with the ubuntu-node app) has an `updated_at` column with no DB
        // default, which this pipeline's intentionally-trimmed schema.prisma
        // (see its header comment) doesn't declare, so Prisma's generated
        // client never sets it and a model-level create() hits a NOT NULL
        // violation.
        const chapterId = randomUUID();
        await target.$executeRaw`
          INSERT INTO book_chapters (id, book_id, title, "order", created_at, updated_at)
          VALUES (${chapterId}, ${BOOK_ID}, ${sourceChapter.title_en}, ${order}, NOW(), NOW())
        `;
        chapter = await target.bookChapter.findUniqueOrThrow({ where: { id: chapterId } });
        console.log(`Created chapter order=${order}: "${sourceChapter.title_en}" (${chapter.id})`);
      }

      const entries = await source.$queryRaw<SourceEntry[]>`
        SELECT e.phrase, e.translation, e.pronunciation, e.explanation_en, e.explanation_si
        FROM entries e
        JOIN subheadings sh ON sh.id = e.subheading_id
        JOIN sub_topics st ON st.id = e.sub_topic_id
        JOIN chapters ch ON ch.id = sh.chapter_id
        WHERE ch.chapter_number = ${sourceChapterNumber} AND e.qa_status = 'passed'
        ORDER BY sh.sort_order, st.sort_order, e.entry_number
      `;

      const seenPhrases = new Set<string>();
      const deduped: SourceEntry[] = [];
      for (const entry of entries) {
        if (seenPhrases.has(entry.phrase)) continue;
        seenPhrases.add(entry.phrase);
        deduped.push(entry);
        if (deduped.length === PHRASES_PER_CHAPTER) break;
      }

      if (deduped.length < PHRASES_PER_CHAPTER) {
        console.warn(
          `chapter_number=${sourceChapterNumber} only had ${deduped.length} distinct passed entries (wanted ${PHRASES_PER_CHAPTER})`,
        );
      }

      // Raw INSERTs for the same reason as book_chapters above (updated_at
      // has no DB default and isn't tracked by the trimmed schema).
      for (const [i, entry] of deduped.entries()) {
        await target.$executeRaw`
          INSERT INTO book_phrases
            (id, chapter_id, phrase, translation_si, pronunciation_si, explanation, explanation_si, "order", created_at, updated_at)
          VALUES
            (${randomUUID()}, ${chapter!.id}, ${entry.phrase}, ${entry.translation}, ${entry.pronunciation},
             ${entry.explanation_en}, ${entry.explanation_si}, ${i}, NOW(), NOW())
        `;
      }

      console.log(`order=${order}: inserted ${deduped.length} phrases from chapter_number=${sourceChapterNumber}`);
    }
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
