import { listAudioFiles } from "./listAudioFiles";

/** Finds the first audio file in `dir` whose name contains one of `keywords` (case-insensitive). */
export function findAudioFileByKeyword(dir: string, keywords: string[]): string | null {
  const files = listAudioFiles(dir);
  const lower = keywords.map((k) => k.toLowerCase());
  return files.find((f) => lower.some((k) => f.toLowerCase().includes(k))) ?? null;
}
