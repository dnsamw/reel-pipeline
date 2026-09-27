// Shared by the server's caption engines (server/captions/), the post
// templates (which describe their content via captionContext) and the GUI.
// Type-only, no runtime imports, so it's safe to import from anywhere.

export type CaptionPlatform = "facebook" | "instagram" | "youtube" | "tiktok";

/**
 * How a post asks the viewer to engage:
 * - quiz: shows an English phrase, the answer (Sinhala meaning) comes later
 * - reversed: shows the Sinhala meaning, the answer (English phrase) comes later
 * - list: everything is visible at once (list story, still posts)
 * - quote: a single statement/tip, no answer to hide
 */
export type CaptionFormat = "quiz" | "reversed" | "list" | "quote";

export type CaptionTone = "friendly" | "challenge" | "teacher";

export interface CaptionItem {
  english: string;
  sinhala?: string | null;
  pronunciation?: string | null;
  explanation?: string | null;
}

/** Everything a caption engine knows about one piece of content - no platform or style choices. */
export interface CaptionContext {
  kind: "reel" | "image";
  format: CaptionFormat;
  /** Chapter title or post title - used for the topic hashtag and hook wording. */
  topic?: string | null;
  items: CaptionItem[];
  /** Free text from the post (a quote's headline, a footer...) when there are no items. */
  extraText?: string[];
}

export interface CaptionOptions {
  tone: CaptionTone;
  /** Picks a different combination from the built-in banks - "Shuffle" just increments it. */
  variant: number;
}

export interface PlatformCaption {
  caption: string;
  /** Only for platforms with a separate title (YouTube). */
  title?: string;
}

/**
 * What produced a published caption - stored on the publication row so
 * performance can later be compared by engine/tone/hook. `edited` = the
 * text was changed by hand after it was suggested.
 */
export interface CaptionMeta {
  engine: "builtin" | "ai" | "manual";
  tone?: CaptionTone;
  /** Id of the built-in hook line used (e.g. "challenge-2"); absent for AI/manual. */
  hookId?: string;
  edited?: boolean;
}

export interface CaptionSuggestion {
  engine: "builtin" | "ai";
  captions: Partial<Record<CaptionPlatform, PlatformCaption & { hookId?: string }>>;
  /** Set when AI was asked for but the built-in engine answered instead - why. */
  fallbackReason?: string;
}
