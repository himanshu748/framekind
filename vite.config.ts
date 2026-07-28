import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * require-corp rather than credentialless: credentialless is Chromium-only, so
 * WebKit ignores it, falls back to unsafe-none and loses crossOriginIsolated,
 * which silently drops Safari to a single WASM thread. Model weights are CORS
 * fetches against a CDN that sends access-control-allow-origin, which satisfies
 * require-corp in both engines.
 */
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
