import { studyPalQuote } from "./templates/StudyPalQuote";
import type { PostTemplateDef } from "./types";

/**
 * Every post template the Post Creator (gui /post-creator) and the "Post"
 * still composition (Root.tsx -> PostStill.tsx) know about. To add one:
 * port the HTML design from post-templates/ into templates/<Name>.tsx
 * exporting a PostTemplateDef, then append it here - nothing else changes.
 */
export const postTemplates: PostTemplateDef[] = [studyPalQuote];

export function getPostTemplate(id: string): PostTemplateDef | undefined {
  return postTemplates.find((t) => t.id === id);
}
