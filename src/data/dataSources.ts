/**
 * Registry of data models a recipe's `custom` beat text layers can bind
 * against (recipe/layers/schema.ts's `dataField` text source) - the
 * future-proof half of docs/COMPOSITION_DESIGNER.md's data-binding design.
 * No Prisma import here on purpose, same discipline as phrase.ts: this file
 * (or its contents) needs to be safe to reach from src/compositions/** and
 * from the GUI, neither of which can carry PrismaClient into the browser.
 *
 * Adding a real second data source later means adding one more entry here
 * (plus, separately, that model's own Prisma-isolated fetch file, mirroring
 * data/getPhrases.ts's pattern) - the recipe schema and every GUI component
 * that reads this registry stay unchanged.
 */

export interface DataSourceField {
  key: string;
  label: string;
  /** Only "text" is wired to any binding UI today - the field exists so a future source's non-string fields have somewhere to declare themselves. */
  type: "text";
}

export interface DataSourceDescriptor {
  id: string;
  label: string;
  fields: DataSourceField[];
}

/** Mirrors data/phrase.ts's Phrase fields exactly (excluding chapterId/chapterTitle/chapterOrder/order - batch/positional metadata, not phrase content). */
export const dataSources: Record<string, DataSourceDescriptor> = {
  BookPhrase: {
    id: "BookPhrase",
    label: "Book phrase",
    fields: [
      { key: "phrase", label: "Phrase (English)", type: "text" },
      { key: "translationSi", label: "Sinhala meaning", type: "text" },
      { key: "pronunciationSi", label: "Sinhala pronunciation", type: "text" },
      { key: "explanation", label: "Explanation (English)", type: "text" },
      { key: "explanationSi", label: "Explanation (Sinhala)", type: "text" },
    ],
  },
};

export const defaultDataSourceId = "BookPhrase";
