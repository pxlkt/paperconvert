import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  plugins: [solid()],
  server: {
    port: 5174,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
  },
  build: {
    target: "esnext",
    // the HEIC decoder (libheif compiled to JS) is a 2 MB chunk on its own;
    // it only loads when someone converts a HEIC photo
    chunkSizeWarningLimit: 2100,
  },
});
