import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base ("./") keeps asset URLs working whether the app is served
// from the domain root or a GitHub Pages project subpath
// (e.g. https://<user>.github.io/<repo>/), so no repo-specific config is needed.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
