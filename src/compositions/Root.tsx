import { z } from "zod";
import { Composition, registerRoot } from "remotion";
import { registerFonts } from "../theme/fonts";
import { reelDefaultProps, sampleBatches } from "./reelProps";
import { makeCompositionFromRecipe, CompositionFromRecipeDynamic, calculateMetadataForRecipeDynamic, reelPropsWithRecipeSchema } from "./recipe/CompositionFromRecipe";
import { builtInRecipes } from "./recipe/recipes";
import { configSchema, defaultConfig } from "../config/config";
import { phraseSchema } from "../data/phrase";
import { LayerRenderer } from "./recipe/layers/LayerRenderer";
import { customBeatSchema } from "./recipe/layers/schema";
import { pocBeat } from "./recipe/layers/poc";

// Fires once when the bundle loads; loadFont/loadCustomFont each call
// Remotion's delayRender/continueRender internally, so this blocks any
// composition from rendering until both Poppins and Noto Sans Sinhala are
// actually ready - no manual delayRender bookkeeping needed here.
registerFonts();

// Composition ids ("Reel"/"Reel-T2"/"Reel-T3", matching Template
// numbers "1"/"2"/"3" - see renderBatch.ts's COMPOSITION_IDS) and each
// recipe's phrasesPerReel-agnostic default props, resolved once here so
// both the main and the per-sample-batch <Composition>s below share it.
const COMPOSITION_ID: Record<"1" | "2" | "3", string> = { "1": "Reel", "2": "Reel-T2", "3": "Reel-T3" };

function RemotionRoot() {
  return (
    <>
      {(["1", "2", "3"] as const).map((id) => {
        const { component, calculateMetadata, propsSchema, defaultProps } = makeCompositionFromRecipe(builtInRecipes[id]);
        return (
          <Composition
            key={id}
            id={COMPOSITION_ID[id]}
            component={component}
            schema={propsSchema}
            calculateMetadata={calculateMetadata}
            durationInFrames={300}
            fps={30}
            width={1080}
            height={1920}
            defaultProps={defaultProps}
          />
        );
      })}

      {/* The one dynamic composition custom (non-built-in) recipes render
          through - `recipe` comes in as a real prop at render time instead
          of being fixed at bundle time, which is what makes a GUI-authored
          recipe actually renderable without a bundle rebuild. See
          server/recipes.ts / renderBatch.ts's --recipeFile and
          docs/COMPOSITION_DESIGNER.md. defaultProps.recipe is just a
          starting point for Studio browsing - any recipe can be passed in
          via inputProps at render time. */}
      <Composition
        id="Reel-Custom"
        component={CompositionFromRecipeDynamic}
        schema={reelPropsWithRecipeSchema}
        calculateMetadata={calculateMetadataForRecipeDynamic}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ ...reelDefaultProps, recipe: builtInRecipes["1"] }}
      />

      <SampleReels />

      {/* Phase 1 proof of docs/COMPOSITION_DESIGNER.md's draft layer schema
          (recipe/layers/) - a generic LayerRenderer interpreting a
          hand-written CustomBeat as pure data. Standalone and unwired from
          the production beat system (beatSchema/CompositionFromRecipe.tsx)
          on purpose - see the doc for the phased plan this is step 1 of. */}
      <Composition
        id="LayerDesignerPOC"
        component={LayerDesignerPOC}
        schema={layerDesignerPocPropsSchema}
        durationInFrames={pocBeat.durationInFrames}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ beat: pocBeat, phrase: sampleBatches[0][0], config: defaultConfig }}
      />
    </>
  );
}

const layerDesignerPocPropsSchema = z.object({ beat: customBeatSchema, phrase: phraseSchema.nullable(), config: configSchema });

function LayerDesignerPOC({ beat, phrase, config }: z.infer<typeof layerDesignerPocPropsSchema>) {
  return <LayerRenderer beat={beat} phrase={phrase} config={config} />;
}

function SampleReels() {
  // One Composition per real chapter-1 batch pulled by `npm run
  // data:export-sample`, per template - lets you flip through several real
  // reels in Studio's sidebar to spot-check long phrases/explanations for
  // overflow, same as before this branch (see docs/COMPOSITION_DESIGNER.md).
  return (["1", "2", "3"] as const).flatMap((id) => {
    const { component, calculateMetadata, propsSchema, defaultProps } = makeCompositionFromRecipe(builtInRecipes[id]);
    return sampleBatches.map((phrases, i) => (
      <Composition
        key={`${id}-${i}`}
        id={`${COMPOSITION_ID[id]}-Sample-${i + 1}`}
        component={component}
        schema={propsSchema}
        calculateMetadata={calculateMetadata}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ ...defaultProps, phrases }}
      />
    ));
  });
}

registerRoot(RemotionRoot);
