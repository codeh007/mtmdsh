#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const libRoot = resolve(packageRoot, "lib");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");

rmSync(libRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc)) throw new Error("mtmcanvas build: local TypeScript executable is missing");
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });
for (const declaration of ["lib/types/index.d.ts", "lib/types/client/index.d.ts"]) {
  if (!existsSync(resolve(packageRoot, declaration))) throw new Error("mtmcanvas build: missing " + declaration);
}

await build({
  entryPoints: [resolve(packageRoot, "src/client/index.ts")],
  outfile: resolve(libRoot, "client.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  logLevel: "info",
});
const artifact = await import(resolve(libRoot, "client.js"));
if (typeof artifact.mount !== "function") throw new Error("mtmcanvas build: client artifact must export mount(context)");

console.log("built mtmcanvas browser ESM artifact");
