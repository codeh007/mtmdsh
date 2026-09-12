import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    outDir: resolve(packageRoot, "lib"),
    lib: {
      entry: resolve(packageRoot, "src/client/index.ts"),
      formats: ["es"],
      fileName: () => "client.js",
    },
    rollupOptions: {
      external: [/^react(?:\/|$)/, "@deepseek-ai/cordis"],
    },
  },
});
