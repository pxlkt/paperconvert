import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// The prerender bundle: the browser build of src/prerender.tsx, run in jsdom
// by scripts/prerender.ts. It is a normal client build (not SSR) because the
// published PaperUI package ships DOM-compiled components only.
export default defineConfig({
  plugins: [solid()],
  publicDir: false,
  build: {
    outDir: "dist-prerender",
    emptyOutDir: true,
    target: "esnext",
    minify: false,
    rollupOptions: {
      input: "src/prerender.tsx",
      preserveEntrySignatures: "exports-only",
      output: { format: "es", entryFileNames: "prerender.js" },
    },
  },
});
