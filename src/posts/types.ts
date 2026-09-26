import type { ComponentType } from "react";
import type { Palette } from "../theme/tokens";

/** A plain single-value input - also what each item of a "list" field is made of. */
export interface PostScalarFieldDef {
  key: string;
  label: string;
  /** "image" values are an assets/-relative path ("images/x.png"), an http(s) URL, or a data: URI - see resolvePostAsset. Empty string = no image. */
  type: "text" | "textarea" | "image";
  /** e.g. "si" - set on the input so Sinhala gets the right IME/shaping hints. */
  lang?: string;
  hint?: string;
}

/**
 * A repeatable group of sub-fields (e.g. a numbered list of phrases). Its
 * value lives in `lists[key]`, not `fields` - so templates without lists keep
 * `fields` as plain strings.
 */
export interface PostListFieldDef {
  key: string;
  label: string;
  type: "list";
  /** Singular label for one entry, e.g. "Idiom" - used on the add button and item headers. */
  itemLabel: string;
  itemFields: PostScalarFieldDef[];
  minItems?: number;
  maxItems?: number;
  hint?: string;
}

/**
 * One editable slot of a post template, in the order the Post Creator GUI's
 * Content form (gui/src/pages/PostCreator.tsx) shows them - the form is
 * generated from these, so a new template only declares its fields here.
 */
export type PostFieldDef = PostScalarFieldDef | PostListFieldDef;

export interface PostColorDef {
  key: string;
  label: string;
}

export type PostFields = Record<string, string>;
export type PostListItem = Record<string, string>;
export type PostLists = Record<string, PostListItem[]>;
export type PostColors = Record<string, string>;

export interface PostTemplateProps {
  fields: PostFields;
  lists: PostLists;
  colors: PostColors;
}

export interface PostTemplateDef {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  fields: PostFieldDef[];
  colors: PostColorDef[];
  defaultFields: PostFields;
  /** Starting items for each "list" field - omit when the template has none. */
  defaultLists?: PostLists;
  defaultColors: PostColors;
  /**
   * Maps a Reel template's palette (gui /templates - ReelTheme.light/dark)
   * onto this template's own color slots, so posts can reuse the same brand
   * colors as reels without each template's slots having to match Palette's.
   */
  colorsFromPalette: (palette: Palette, variant: "light" | "dark") => PostColors;
  /** Resolves once every font the component uses is loaded - awaited before the fit measurements and before renderStill captures. */
  loadFonts: () => Promise<unknown>;
  component: ComponentType<PostTemplateProps>;
}
