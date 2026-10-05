import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";

// Worklet must be a real file, not a data: URI that Vite inlines for small assets.
// The Cloudflare plugin makes `vite build` emit the Build Output that `cf deploy` uploads (.cloudflare/output).
export default defineConfig({ build: { assetsInlineLimit: 0 }, plugins: [cloudflare()] });
