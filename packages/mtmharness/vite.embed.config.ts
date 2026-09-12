import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import packageManifest from "./package.json" with { type: "json" };
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const embedExport = packageManifest.exports["./embed"];
const embedOutput = typeof embedExport === "object" ? embedExport.import : undefined;
const embedIifeOutput = packageManifest.unpkg;
if (typeof embedOutput !== "string" || typeof embedIifeOutput !== "string" || dirname(embedOutput) !== dirname(embedIifeOutput)) {
  throw new Error("mtmharness embed build: package embed outputs must share a directory");
}

export default defineConfig({
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src/embed", import.meta.url)) },
  },
  build: {
    outDir: resolve(packageRoot, dirname(embedOutput)),
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/embed/index.tsx", import.meta.url)),
      name: "MtmHarnessClient",
      formats: ["es", "iife"],
      fileName: (format) => format === "iife" ? basename(embedIifeOutput) : basename(embedOutput),
    },
  },
});
