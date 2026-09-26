import type { ComponentType } from "react";
import type { Palette } from "../theme/tokens";

/**
 * One editable text/image slot of a post template - drives the Post Creator
 * GUI's form (gui/src/pages/PostCreator.tsx) generically, so a new template
 * only has to declare its fields here, not touch the page.
 */
export interface PostFieldDef {
  key: string;
  label: string;
  /** "image" values are an assets/-relative path ("images/x.png"), an http(s) URL, or a data: URI - see resolvePostAsset. Empty string = no image. */
  type: "text" | "textarea" | "image";
  /** e.g. "si" - set on the input so Sinhala gets the right IME/shaping hints. */
  lang?: string;
  hint?: string;
}

export interface PostColorDef {
  key: string;
  label: string;
}

export type PostFields = Record<string, string>;
export type PostColors = Record<string, string>;

export interface PostTemplateProps {
  fields: PostFields;
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
  defaultColors: PostColors;
  /**
   * Maps a Reel template's palette (gui /templates - ReelTheme.light/dark)
   * onto this template's own color slots, so posts can reuse the same brand
   * colors as reels without each template's slots having to match Palette's.
   */
  colorsFromPalette: (palette: Palette, variant: "light" | "dark") => PostColors;
  /** Resolves once every font the component uses is loaded - awaited before the headline-fit measurement and before renderStill captures. */
  loadFonts: () => Promise<unknown>;
  component: ComponentType<PostTemplateProps>;
}
