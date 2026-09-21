import { compositionRecipeSchema, type CompositionRecipe } from "../schema";
import template1 from "./template-1.json";
import template2 from "./template-2.json";
import template3 from "./template-3.json";

// Parsed (not just imported) so a hand-edited recipe JSON that drifts from
// the schema fails loudly here instead of silently misbehaving at render
// time - same reasoning as configSchema validating defaultConfig.
export const builtInRecipes: Record<"1" | "2" | "3", CompositionRecipe> = {
  "1": compositionRecipeSchema.parse(template1),
  "2": compositionRecipeSchema.parse(template2),
  "3": compositionRecipeSchema.parse(template3),
};
