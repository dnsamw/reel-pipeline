import { PostCreator } from "./PostCreator";
import { AiGenerate } from "./VocabPost";
import { vocabListPostTemplates } from "../../../src/posts/registry";

/**
 * Picture vocabulary list - one photo per word next to its pronunciation and
 * Sinhala meaning. Same AI word generator as Vocab Post (photos are added per
 * row afterwards), with its own templates and saved draft.
 */
export function VocabListPost() {
  return (
    <PostCreator
      title="Vocab List"
      templates={vocabListPostTemplates}
      storagePrefix="studypal-reels:vocab-list-post"
      templateHeading="Size"
      sharedDraft
      contentExtras={(draft, setDraft, onError) => <AiGenerate draft={draft} setDraft={setDraft} onError={onError} />}
    />
  );
}
