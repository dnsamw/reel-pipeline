import { studyPalQuote } from "./templates/StudyPalQuote";
import { studyPalListStory } from "./templates/StudyPalListStory";
import { studyPalHookPhoto } from "./templates/StudyPalHookPhoto";
import { studyPalVocabStory, studyPalVocabFeed, studyPalVocabPhotoStory, studyPalVocabPhotoFeed } from "./templates/StudyPalVocab";
import { studyPalSentencePhoto } from "./templates/StudyPalSentencePhoto";
import { studyPalVocabListStory, studyPalVocabListFeed } from "./templates/StudyPalVocabList";
import { studyPalWordChartStory, studyPalWordChartFeed } from "./templates/StudyPalWordChart";
import { studyPalWordUpgradeStory, studyPalWordUpgradeFeed } from "./templates/StudyPalWordUpgrade";
import { studyPalQnAStory, studyPalQnAFeed, studyPalQnAMeaningStory, studyPalQnAMeaningFeed } from "./templates/StudyPalQnA";
import type { PostTemplateDef } from "./types";

/**
 * Every post template the Post Creator (gui /post-creator) and the "Post"
 * still composition (Root.tsx -> PostStill.tsx) know about. To add one:
 * port the HTML design from post-templates/ into templates/<Name>.tsx
 * exporting a PostTemplateDef, then append it here - nothing else changes.
 */
export const postTemplates: PostTemplateDef[] = [studyPalQuote, studyPalListStory, studyPalHookPhoto];

/** The Vocab Post page's sizes (gui /vocab-post) - kept out of Post Creator's picker, but rendered by the same "Post" still. */
export const vocabPostTemplates: PostTemplateDef[] = [studyPalVocabStory, studyPalVocabFeed];

/** The Vocab Photo page's sizes (gui /vocab-photo-post) - the vocab table over a background photo. */
export const vocabPhotoPostTemplates: PostTemplateDef[] = [studyPalVocabPhotoStory, studyPalVocabPhotoFeed];

/** The Sentence Post page's sizes (gui /sentence-post) - same arrangement as the vocab ones. */
export const sentencePostTemplates: PostTemplateDef[] = [studyPalSentencePhoto];

/** The Vocab List page's sizes (gui /vocab-list-post) - one photo per word, with pronunciation and meaning. */
export const vocabListPostTemplates: PostTemplateDef[] = [studyPalVocabListStory, studyPalVocabListFeed];

/** The Word Chart page's sizes (gui /word-chart, under English) - "I -> am" style rows in a framed card. */
export const wordChartPostTemplates: PostTemplateDef[] = [studyPalWordChartStory, studyPalWordChartFeed];

/** The Basic -> Advanced page's sizes (gui /word-upgrade, under English). */
export const wordUpgradePostTemplates: PostTemplateDef[] = [studyPalWordUpgradeStory, studyPalWordUpgradeFeed];

/** The Questions vs Answers page's sizes (gui /qna-post, under English). */
export const qnaPostTemplates: PostTemplateDef[] = [studyPalQnAStory, studyPalQnAFeed];

/** The Q&A with Meaning page's sizes (gui /qna-meaning-post, under Posts) - Questions vs Answers plus a Sinhala line under each. */
export const qnaMeaningPostTemplates: PostTemplateDef[] = [studyPalQnAMeaningStory, studyPalQnAMeaningFeed];

export function getPostTemplate(id: string): PostTemplateDef | undefined {
  return [...postTemplates, ...vocabPostTemplates, ...vocabPhotoPostTemplates, ...sentencePostTemplates, ...vocabListPostTemplates, ...wordChartPostTemplates, ...wordUpgradePostTemplates, ...qnaPostTemplates, ...qnaMeaningPostTemplates].find((t) => t.id === id);
}
