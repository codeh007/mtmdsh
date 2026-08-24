import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./standalone/src", import.meta.url)),
      "@deepseek-ai/dsh-client-ui-primitives": fileURLToPath(new URL("./tests/primitive-stub.tsx", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "standalone/src/**/*.test.ts",
      "standalone/src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "tests/**/*.test.tsx",
    ],
    root: packageRoot,
  },
});
