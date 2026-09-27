import type { PostFields, PostLists, PostTemplateDef } from "../../../src/posts/types";
import type { CaptionContext } from "../../../src/captions/types";

/** The template's own caption suggestion, or its text fields joined together - the fallback if the caption engine can't answer. */
export function suggestPostCaption(def: PostTemplateDef, fields: PostFields, lists: PostLists): string {
  if (def.suggestCaption) return def.suggestCaption(fields, lists);
  return textFields(def, fields).join("\n\n");
}

/** What the post says, for the caption engines - the template's own description, or its text fields as free text. */
export function postCaptionContext(def: PostTemplateDef, fields: PostFields, lists: PostLists, kind: CaptionContext["kind"]): CaptionContext {
  if (def.captionContext) return { kind, ...def.captionContext(fields, lists) };
  return { kind, format: "quote", items: [], extraText: textFields(def, fields) };
}

function textFields(def: PostTemplateDef, fields: PostFields): string[] {
  return def.fields
    .filter((f) => f.type === "text" || f.type === "textarea")
    .map((f) => fields[f.key])
    .filter(Boolean);
}
