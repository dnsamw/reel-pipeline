import { PostCreator } from "./PostCreator";
import { AiGenerate } from "./VocabPost";
import { vocabPhotoPostTemplates } from "../../../src/posts/registry";

/**
 * Vocab Post over a background photo - the same table, sizes and AI word
 * generator, with its own templates (studypal-vocab-photo-*) and its own
 * saved draft, so it doesn't overwrite the plain Vocab Post's.
 */
export function VocabPhotoPost() {
  return (
    <PostCreator
      title="Vocab Photo"
      templates={vocabPhotoPostTemplates}
      storagePrefix="studypal-reels:vocab-photo-post"
      templateHeading="Size"
      sharedDraft
      contentExtras={(draft, setDraft, onError) => <AiGenerate draft={draft} setDraft={setDraft} onError={onError} />}
    />
  );
}
