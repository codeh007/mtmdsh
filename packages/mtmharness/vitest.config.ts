import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@deepseek-ai/dsh-client-ui-primitives": fileURLToPath(new URL("./tests/primitive-stub.tsx", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts", "tests/**/*.test.tsx"],
    root: packageRoot,
  },
});
