import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getPhrases, disconnect } from "./getPhrases";
import { batchPhrases } from "./batch";
import { defaultConfig } from "../config/config";

/**
 * Runs in Node (via tsx) - NOT part of the Remotion browser bundle. Prisma's
 * client can only run here, never imported from Root.tsx/Reel.tsx/scenes,
 * since those get bundled and executed inside a headless Chrome page where
 * Prisma's native query engine and Node built-ins don't exist.
 *
 * Writes a couple of real batches out to a static JSON file so Remotion
 * Studio can preview real chapter-1 phrases via defaultProps without ever
 * touching the DB itself.
 *
 * Usage: npm run data:export-sample -- --book=volume-2   (once more than one book exists - see docs/ARCHITECTURE.md)
 */
async function main() {
  const bookArg = process.argv.find((a) => a.startsWith("--book="));
  const bookId = bookArg ? bookArg.slice("--book=".length) : null;

  const phrases = await getPhrases(null, bookId);
  const batches = batchPhrases(phrases, defaultConfig.phrasesPerReel);

  if (batches.length === 0) {
    throw new Error("No phrases found in the DB - is the book seeded, and does --book (if used) match a real title?");
  }

  const sample = batches.slice(0, 3).map((b) => b.phrases);
  const outPath = join(process.cwd(), "src/compositions/sample-data.json");
  writeFileSync(outPath, JSON.stringify(sample, null, 2));

  console.log(`Wrote ${sample.length} sample batch(es) from ${batches.length} total batches to ${outPath}`);
  await disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await disconnect();
  process.exit(1);
});
