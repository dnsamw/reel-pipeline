import { z } from "zod";

// Split out from getPhrases.ts on purpose: that file instantiates
// PrismaClient at module scope, which must never be imported as a *value*
// into Root.tsx/Reel.tsx/scenes (they're bundled into the browser Remotion
// renders in, and Prisma's native engine can't run there). This file has no
// Prisma import, so Reel.tsx can safely import `phraseSchema` as a real
// value (needed to build the Zod props schema for Remotion Studio's form
// UI), not just `Phrase` as an erased type.
export const phraseSchema = z.object({
  id: z.string(),
  phrase: z.string(),
  translationSi: z.string().nullable(),
  pronunciationSi: z.string().nullable(),
  explanation: z.string(),
  explanationSi: z.string().nullable(),
  chapterId: z.string(),
  chapterTitle: z.string(),
  chapterOrder: z.number(),
  order: z.number(),
});

export type Phrase = z.infer<typeof phraseSchema>;
