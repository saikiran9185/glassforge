import { defineConfig } from "vite";

// base is set from BASE_PATH so GitHub Pages (/<repo>/) works without code changes.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  build: { target: "es2022" },
});
