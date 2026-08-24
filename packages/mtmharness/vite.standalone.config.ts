import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  root: fileURLToPath(new URL("./standalone", import.meta.url)),
  base: process.env.VITE_MTMHARNESS_APP_BASE ?? "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./standalone/src", import.meta.url)) },
  },
  build: {
    outDir: fileURLToPath(new URL("./dist/standalone", import.meta.url)),
    emptyOutDir: true,
    sourcemap: true,
  },
});
