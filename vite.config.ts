import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { readFileSync } from "node:fs";

// FFmpeg's wasm (32 MB) is over Cloudflare's 25 MiB per-file limit, so it
// loads from jsDelivr at the installed version (src/lib/ffmpeg.ts)
const ffmpegCore = JSON.parse(readFileSync("node_modules/@ffmpeg/core/package.json", "utf8")) as { version: string };

export default defineConfig({
  plugins: [solid()],
  define: {
    __FFMPEG_CORE_VERSION__: JSON.stringify(ffmpegCore.version),
  },
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
