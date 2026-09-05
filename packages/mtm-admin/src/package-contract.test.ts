import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("mtm-admin package contract", () => {
  it("publishes a secondary launcher and independent app entry", () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>;
      mtmharness?: { secondary?: { id?: string; apiVersion?: number; client?: string } };
    };
    expect(manifest.mtmharness?.secondary).toEqual({ id: "mtm-admin", apiVersion: 1, client: "./lib/client.js" });
    expect(manifest.exports?.["./client"]).toMatchObject({ import: "./lib/client.js" });
    expect(manifest.exports?.["./app"]).toBe("./dist/standalone/index.html");
    expect(existsSync(resolve(packageRoot, "public/config.js"))).toBe(true);
  });
});
