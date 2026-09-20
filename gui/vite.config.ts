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
