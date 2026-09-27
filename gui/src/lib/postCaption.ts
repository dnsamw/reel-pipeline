import type { PostFields, PostLists, PostTemplateDef } from "../../../src/posts/types";

/** The template's own caption suggestion, or its text fields joined together. */
export function suggestPostCaption(def: PostTemplateDef, fields: PostFields, lists: PostLists): string {
  if (def.suggestCaption) return def.suggestCaption(fields, lists);
  return def.fields
    .filter((f) => f.type === "text" || f.type === "textarea")
    .map((f) => fields[f.key])
    .filter(Boolean)
    .join("\n\n");
}
