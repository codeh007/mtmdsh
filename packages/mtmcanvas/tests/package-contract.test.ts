import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("mtmcanvas package contract", () => {
  it("declares an installable DSH Bundle and Web Client face", () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      exports: { ".": { default?: string }; "./client": { default?: string } };
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string; inject?: string[] } };
    };
    expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh?.client?.platform).toBe("web");
    expect(manifest.dsh?.client?.inject).toContain("@deepseek-ai/dsh-client-ui-sidebar");
    expect(manifest.exports["."]?.default).toBe("./lib/index.js");
    expect(manifest.exports["./client"]?.default).toBe("./lib/client.cjs");
  });
});
