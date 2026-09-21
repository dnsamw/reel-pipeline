import { Composition, registerRoot } from "remotion";
import { registerFonts } from "../theme/fonts";
import { Reel, calculateReelMetadata, reelDefaultProps, reelPropsSchema, sampleBatches } from "./Reel";
import { ReelTemplate2, calculateReelTemplate2Metadata, reelTemplate2DefaultProps, reelTemplate2PropsSchema } from "./ReelTemplate2";
import { ReelTemplate3, calculateReelTemplate3Metadata, reelTemplate3DefaultProps, reelTemplate3PropsSchema } from "./ReelTemplate3";
import { makeCompositionFromRecipe } from "./recipe/CompositionFromRecipe";
import { builtInRecipes } from "./recipe/recipes";

// Fires once when the bundle loads; loadFont/loadCustomFont each call
// Remotion's delayRender/continueRender internally, so this blocks any
// composition from rendering until both Poppins and Noto Sans Sinhala are
// actually ready - no manual delayRender bookkeeping needed here.
registerFonts();

function RemotionRoot() {
  return (
    <>
      <Composition
        id="Reel"
        component={Reel}
        schema={reelPropsSchema}
        calculateMetadata={calculateReelMetadata}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={reelDefaultProps}
      />
      <SampleReels />

      <Composition
        id="Reel-T2"
        component={ReelTemplate2}
        schema={reelTemplate2PropsSchema}
        calculateMetadata={calculateReelTemplate2Metadata}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={reelTemplate2DefaultProps}
      />
      <SampleReelsT2 />

      <Composition
        id="Reel-T3"
        component={ReelTemplate3}
        schema={reelTemplate3PropsSchema}
        calculateMetadata={calculateReelTemplate3Metadata}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={reelTemplate3DefaultProps}
      />
      <SampleReelsT3 />

      {/* Experimental (feature/composition-designer-schema): the same three
          templates above, re-rendered through the generic recipe interpreter
          instead of their own hand-written .tsx - see
          docs/COMPOSITION_DESIGNER.md. Side-by-side with "Reel"/"Reel-T2"/
          "Reel-T3" in Studio's sidebar for visual comparison; not used by
          renderBatch.ts or the GUI. */}
      {(["1", "2", "3"] as const).map((id) => {
        const { component, calculateMetadata, propsSchema, defaultProps } = makeCompositionFromRecipe(builtInRecipes[id]);
        return (
          <Composition
            key={id}
            id={`Reel-Recipe-${id}`}
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
    </>
  );
}

function SampleReels() {
  // One Composition per real chapter-1 batch pulled by `npm run
  // data:export-sample` - lets you flip through several real reels in
  // Studio's sidebar to spot-check long phrases/explanations for overflow.
  return sampleBatches.map((phrases, i) => (
    <Composition
      key={i}
      id={`Reel-Sample-${i + 1}`}
      component={Reel}
      schema={reelPropsSchema}
      calculateMetadata={calculateReelMetadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ ...reelDefaultProps, phrases }}
    />
  ));
}

function SampleReelsT2() {
  return sampleBatches.map((phrases, i) => (
    <Composition
      key={i}
      id={`Reel-T2-Sample-${i + 1}`}
      component={ReelTemplate2}
      schema={reelTemplate2PropsSchema}
      calculateMetadata={calculateReelTemplate2Metadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ ...reelTemplate2DefaultProps, phrases }}
    />
  ));
}

function SampleReelsT3() {
  return sampleBatches.map((phrases, i) => (
    <Composition
      key={i}
      id={`Reel-T3-Sample-${i + 1}`}
      component={ReelTemplate3}
      schema={reelTemplate3PropsSchema}
      calculateMetadata={calculateReelTemplate3Metadata}
      durationInFrames={300}
      fps={30}
      width={1080}
      height={1920}
      defaultProps={{ ...reelTemplate3DefaultProps, phrases }}
    />
  ));
}

registerRoot(RemotionRoot);
