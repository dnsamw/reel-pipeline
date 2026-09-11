import { Composition, registerRoot } from "remotion";
import { registerFonts } from "../theme/fonts";
import { Reel, calculateReelMetadata, reelDefaultProps, reelPropsSchema, sampleBatches } from "./Reel";
import { ReelTemplate2, calculateReelTemplate2Metadata, reelTemplate2DefaultProps, reelTemplate2PropsSchema } from "./ReelTemplate2";
import { ReelTemplate3, calculateReelTemplate3Metadata, reelTemplate3DefaultProps, reelTemplate3PropsSchema } from "./ReelTemplate3";

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
