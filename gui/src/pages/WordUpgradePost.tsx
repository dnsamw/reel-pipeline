import { PostCreator } from "./PostCreator";
import { wordUpgradePostTemplates } from "../../../src/posts/registry";

/**
 * Basic -> Advanced word list (English section) - heading tabs over two
 * columns, "• basic ———> advanced" rows. The Post Creator page locked to these
 * templates, with its own saved draft.
 */
export function WordUpgradePost() {
  return <PostCreator title="Basic → Advanced" templates={wordUpgradePostTemplates} storagePrefix="studypal-reels:word-upgrade" templateHeading="Size" sharedDraft />;
}
