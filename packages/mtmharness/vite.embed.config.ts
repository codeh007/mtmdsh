import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL("./standalone", import.meta.url)),
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./standalone/src", import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/embed", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./standalone/src/embed.tsx", import.meta.url)),
      name: "MtmHarnessClient",
      formats: ["es", "iife"],
      fileName: (format) => format === "iife" ? "mtmharness.iife.js" : "mtmharness.js",
    },
  },
});
