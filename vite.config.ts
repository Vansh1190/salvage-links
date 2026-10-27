import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    outDir: "dist",
    assetsInlineLimit: 2048,
  },
  server: { port: 5175 },
  preview: { port: 4173 },
});
