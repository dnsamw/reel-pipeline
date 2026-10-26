import { PostCreator } from "./PostCreator";
import { sentencePostTemplates } from "../../../src/posts/registry";
import { SENTENCE_DRAW_FIELD } from "../../../src/posts/templates/StudyPalSentencePhoto";

/**
 * One English sentence on a photo (sentence, Sinhala meaning, pronunciation
 * in a single movable box) - the Post Creator page locked to the sentence
 * templates, plus a pencil for drawing lines on the image.
 */
export function SentencePost() {
  return <PostCreator title="Sentence Post" templates={sentencePostTemplates} storagePrefix="studypal-reels:sentence-post" templateHeading="Size" sharedDraft drawField={SENTENCE_DRAW_FIELD} />;
}
