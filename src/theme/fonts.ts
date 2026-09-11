import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";
import { loadFont as loadCustomFont } from "@remotion/fonts";
import { staticFile } from "remotion";
import { fontFamily } from "./tokens";

/**
 * Registers both fonts used across every scene. Call once (e.g. at the top
 * of Root.tsx) before any composition renders - Remotion delays rendering
 * until the returned promises resolve, so text never flashes in a fallback
 * font or (worse for Sinhala) fails to shape at all.
 */
export function registerFonts(): Promise<unknown> {
  const poppins = loadPoppins("normal", { weights: ["400", "700"], subsets: ["latin"] }).waitUntilDone();

  const sinhalaRegular = loadCustomFont({
    family: fontFamily.sinhala,
    url: staticFile("fonts/NotoSansSinhala-Regular.ttf"),
    weight: "400",
  });
  const sinhalaBold = loadCustomFont({
    family: fontFamily.sinhala,
    url: staticFile("fonts/NotoSansSinhala-Bold.ttf"),
    weight: "700",
  });

  return Promise.all([poppins, sinhalaRegular, sinhalaBold]);
}
