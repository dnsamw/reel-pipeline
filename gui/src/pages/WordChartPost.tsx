import { PostCreator } from "./PostCreator";
import { wordChartPostTemplates } from "../../../src/posts/registry";

/**
 * Classroom word chart (English section) - a title pill and "I -> am" rows,
 * each word with its own color. The Post Creator page locked to the chart
 * templates, with its own saved draft.
 */
export function WordChartPost() {
  return <PostCreator title="Word Chart" templates={wordChartPostTemplates} storagePrefix="studypal-reels:word-chart" templateHeading="Size" sharedDraft />;
}
