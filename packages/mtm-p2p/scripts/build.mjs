#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
const root = fileURLToPath(new URL("..", import.meta.url)),
  lib = resolve(root, "lib"),
  tsc = resolve(root, "node_modules/.bin/tsc");
rmSync(lib, { recursive: true, force: true });
mkdirSync(lib, { recursive: true });
if (!existsSync(tsc)) throw new Error("typescript missing");
execFileSync(tsc, ["--project", resolve(root, "tsconfig.json")], {
  cwd: root,
  stdio: "inherit",
});
for (const [entry, out] of [
  ["src/client.ts", "client.js"],
  ["src/worker.ts", "worker.js"],
])
  await build({
    entryPoints: [resolve(root, entry)],
    outfile: resolve(lib, out),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    legalComments: "none",
  });
