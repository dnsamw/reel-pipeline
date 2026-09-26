import { useCallback, useEffect, useState } from "react";
import { continueRender, delayRender, type CalculateMetadataFunction } from "remotion";
import { PostHoldContext, type HoldFn } from "./PostReady";
import { getPostTemplate, postTemplates } from "./registry";
import type { PostColors, PostFields, PostLists } from "./types";

export interface PostStillProps extends Record<string, unknown> {
  templateId: string;
  fields: PostFields;
  lists: PostLists;
  colors: PostColors;
}

export const postStillDefaultProps: PostStillProps = {
  templateId: postTemplates[0].id,
  fields: postTemplates[0].defaultFields,
  lists: postTemplates[0].defaultLists ?? {},
  colors: postTemplates[0].defaultColors,
};

/** Sizes the still to the chosen template, so templates aren't locked to 1080x1080. */
export const calculatePostMetadata: CalculateMetadataFunction<PostStillProps> = ({ props }) => {
  const def = getPostTemplate(props.templateId);
  if (!def) throw new Error(`Unknown post template "${props.templateId}"`);
  return { width: def.width, height: def.height };
};

/**
 * The "Post" <Still> (Root.tsx) that server/postRenderer.ts renders to PNG
 * via renderStill. Same template component the GUI previews - the only
 * difference is this supplies a delayRender-backed hold() so the capture
 * waits for fonts, image decode and the headline fit.
 */
export function PostStill({ templateId, fields, lists, colors }: PostStillProps) {
  const def = getPostTemplate(templateId);
  const [fontHandle] = useState(() => delayRender("post: fonts"));
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    if (!def) {
      continueRender(fontHandle);
      return;
    }
    def.loadFonts().then(
      () => {
        setFontsReady(true);
        continueRender(fontHandle);
      },
      (err) => {
        console.error(err);
        setFontsReady(true);
        continueRender(fontHandle);
      },
    );
  }, [def, fontHandle]);

  const hold = useCallback<HoldFn>((label) => {
    const handle = delayRender(label);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
  }, []);

  if (!def) throw new Error(`Unknown post template "${templateId}"`);
  if (!fontsReady) return null;

  const Component = def.component;
  return (
    <PostHoldContext.Provider value={hold}>
      <Component fields={{ ...def.defaultFields, ...fields }} lists={{ ...def.defaultLists, ...lists }} colors={{ ...def.defaultColors, ...colors }} />
    </PostHoldContext.Provider>
  );
}
