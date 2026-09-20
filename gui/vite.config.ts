import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite's `root` defaults to process.cwd(), not this config file's directory -
// pinned explicitly so `vite --config gui/vite.config.ts` finds index.html
// regardless of which directory it's invoked from (root package.json scripts
// always run from the repo root).
const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  // The live template preview (gui/src/components/ReelPreview.tsx) embeds
  // the real Reel/ReelTemplate2/ReelTemplate3 composition components via
  // @remotion/player, which load fonts through remotion's staticFile() -
  // that resolves to a path served from this app's own origin (e.g.
  // /fonts/NotoSansSinhala-Regular.ttf), not through the Express API. Vite's
  // publicDir is what serves that, so it's pointed at the project's real
  // assets/ folder (same one @remotion/bundler uses for actual renders -
  // see renderBatch.ts) instead of the default gui/public (which doesn't exist).
  publicDir: fileURLToPath(new URL("../assets", import.meta.url)),
  plugins: [react()],
  server: {
    port: 5183,
    proxy: {
      // The Express API (server/index.ts) - run separately via `npm run gui:server`,
      // or both together via `npm run gui`.
      "/api": "http://localhost:4300",
    },
  },
  build: {
    outDir: "dist",
  },
});
