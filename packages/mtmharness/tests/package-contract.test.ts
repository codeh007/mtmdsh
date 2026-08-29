import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("mtmharness package contract", () => {
  it("declares both the profile bundle and Web client faces", () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      exports: {
        ".": { default?: string };
        "./client": { default?: string };
        "./embed": { import?: string };
        "./app": string;
      };
      unpkg?: string;
      jsdelivr?: string;
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string; inject?: string[] } };
    };
    expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh?.client?.platform).toBe("web");
    expect(manifest.dsh?.client?.inject).toContain("@deepseek-ai/dsh-client-ui-layout");
    expect(manifest.exports["."]?.default).toBe("./lib/index.js");
    expect(manifest.exports["./client"]?.default).toBe("./lib/client.cjs");
    expect(manifest.exports["./embed"]?.import).toBe("./dist/embed/mtmharness.js");
    expect(manifest.exports["./app"]).toBe("./dist/standalone/index.html");
    expect(manifest.unpkg).toBe("./dist/embed/mtmharness.iife.js");
    expect(manifest.jsdelivr).toBe("./dist/embed/mtmharness.iife.js");
    expect(existsSync(resolve(packageRoot, "src/skills"))).toBe(false);
  });
});
