import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "..");

describe("mtmcanvas package contract", () => {
  it("declares both the profile bundle and Web client faces", () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8")) as {
      exports: Record<string, { default?: string }>;
      dsh?: { bundle?: { patch?: string }; client?: { platform?: string } };
    };
    expect(manifest.dsh?.bundle?.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh?.client?.platform).toBe("web");
    expect(manifest.exports["."]?.default).toBe("./lib/index.js");
    expect(manifest.exports["./client"]?.default).toBe("./lib/client.js");
  });
});
