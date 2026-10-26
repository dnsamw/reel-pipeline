import { PostCreator } from "./PostCreator";
import { qnaMeaningPostTemplates, qnaPostTemplates } from "../../../src/posts/registry";

/**
 * Questions vs Answers (English section) - heading pills with a VS mark,
 * questions | answers split by a line. The Post Creator page locked to these
 * templates, with its own saved draft.
 */
export function QnAPost() {
  return <PostCreator title="Questions vs Answers" templates={qnaPostTemplates} storagePrefix="studypal-reels:qna-post" templateHeading="Size" sharedDraft />;
}

/** The same design with a Sinhala meaning under every question and answer (Posts section), with its own saved draft. */
export function QnAMeaningPost() {
  return <PostCreator title="Q&A with Meaning" templates={qnaMeaningPostTemplates} storagePrefix="studypal-reels:qna-meaning-post" templateHeading="Size" sharedDraft />;
}
