import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const IMAGE_EXT = /\.(png|jpe?g|webp|gif)$/i;

/**
 * Images directly in assets/background-images (subfolders are ignored), as
 * staticFile()-style paths relative to assets/ - e.g.
 * "background-images/cartoon.jpg", matching config.backgroundImage.
 */
export function listBackgroundImages(assetsDir: string = join(process.cwd(), "assets")): string[] {
  const root = join(assetsDir, "background-images");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && IMAGE_EXT.test(entry.name))
    .map((entry) => `background-images/${entry.name}`)
    .sort();
}

/**
 * Returns a picker for config.backgroundImage === RANDOM_BACKGROUND_IMAGE:
 * each call gives the next image from a shuffled deck of
 * listBackgroundImages(), reshuffling once every image has been used - so
 * each generated reel gets a random image, without the same one repeating
 * until the whole folder has had a turn. Returns null if the folder is empty.
 */
export function createRandomBackgroundPicker(assetsDir?: string): () => string | null {
  const images = listBackgroundImages(assetsDir);
  let deck: string[] = [];
  let last: string | null = null;
  return () => {
    if (images.length === 0) return null;
    if (deck.length === 0) {
      deck = [...images];
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      // Don't let a reshuffle start with the image the previous reel just used.
      if (deck.length > 1 && deck[deck.length - 1] === last) [deck[0], deck[deck.length - 1]] = [deck[deck.length - 1], deck[0]];
    }
    last = deck.pop()!;
    return last;
  };
}
