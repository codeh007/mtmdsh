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
if (!existsSync(tsc)) throw new Error("mtm-connect build: local TypeScript executable is missing");
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });

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
if (typeof artifact.mount !== "function") throw new Error("mtm-connect build: client artifact must export mount(context)");

console.log("built mtm-connect browser ESM artifact");
