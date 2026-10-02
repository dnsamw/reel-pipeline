import { useCallback, useEffect, useState } from "react";
import { continueRender, delayRender, type CalculateMetadataFunction } from "remotion";
import { PostHoldContext, type HoldFn } from "../posts/PostReady";
import { AdCanvas, type AdContent } from "./AdCanvas";
import { loadAdFonts } from "./AdKit";
import { adTemplates, getAdTemplate } from "./registry";
import { AD_FORMATS, DEFAULT_MOCKUP_ADJUST } from "./types";

export interface AdStillProps extends AdContent, Record<string, unknown> {
  templateId: string;
}

export const adStillDefaultProps: AdStillProps = {
  templateId: adTemplates[0].id,
  format: "PT",
  product: adTemplates[0].defaultProduct,
  fields: adTemplates[0].defaultFields,
  lists: adTemplates[0].defaultLists ?? {},
  colors: {},
  mockup: DEFAULT_MOCKUP_ADJUST,
};

/** Sizes the still to the chosen format (SQ/PT/ST). */
export const calculateAdMetadata: CalculateMetadataFunction<AdStillProps> = ({ props }) => {
  if (!getAdTemplate(props.templateId)) throw new Error(`Unknown ad template "${props.templateId}"`);
  const f = AD_FORMATS[props.format];
  if (!f) throw new Error(`Unknown ad format "${props.format}"`);
  return { width: f.width, height: f.height };
};

/**
 * The "Ad" <Still> (Root.tsx) that server/adRenderer.ts renders to PNG.
 * Same AdCanvas the GUI previews - this only adds the delayRender-backed
 * hold() so the capture waits for fonts, mockup images and the text fit.
 */
export function AdStill({ templateId, ...content }: AdStillProps) {
  const def = getAdTemplate(templateId);
  const [fontHandle] = useState(() => delayRender("ad: fonts"));
  const [fontsReady, setFontsReady] = useState(false);

  useEffect(() => {
    const done = () => {
      setFontsReady(true);
      continueRender(fontHandle);
    };
    loadAdFonts().then(done, (err) => {
      console.error(err);
      done();
    });
  }, [fontHandle]);

  const hold = useCallback<HoldFn>((label) => {
    const handle = delayRender(label);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      continueRender(handle);
    };
  }, []);

  if (!def) throw new Error(`Unknown ad template "${templateId}"`);
  if (!fontsReady) return null;

  return (
    <PostHoldContext.Provider value={hold}>
      <AdCanvas def={def} {...content} />
    </PostHoldContext.Provider>
  );
}
