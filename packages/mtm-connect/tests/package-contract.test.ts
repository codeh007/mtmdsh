import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("mtm-connect secondary package contract", () => {
  it("publishes only the mtmharness browser extension", () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      dsh?: unknown;
      main?: string;
      type?: string;
      files?: string[];
      exports: { ".": { import?: string; default?: string }; "./client": { import?: string; default?: string } };
      mtmharness?: { secondary?: { id?: string; apiVersion?: number; client?: string } };
    };
    expect(manifest.dsh).toBeUndefined();
    expect(manifest.type).toBe("module");
    expect(manifest.main).toBe("./lib/client.js");
    expect(manifest.exports["."]).toMatchObject({ import: "./lib/client.js", default: "./lib/client.js" });
    expect(manifest.exports["./client"]).toMatchObject({ import: "./lib/client.js", default: "./lib/client.js" });
    expect(manifest.mtmharness?.secondary).toEqual({ id: "mtm-connect", apiVersion: 1, client: "./lib/client.js" });
    expect(manifest.files).toEqual(expect.arrayContaining(["lib/client.js", "lib/types/**/*.d.ts"]));
  });
});
