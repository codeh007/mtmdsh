#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const libRoot = resolve(packageRoot, "lib");
const distRoot = resolve(packageRoot, "dist");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
const vite = resolve(packageRoot, "node_modules/.bin/vite");

rmSync(libRoot, { recursive: true, force: true });
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc) || !existsSync(vite)) throw new Error("mtm-admin build: local TypeScript and Vite executables are required");

execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });
await build({
  entryPoints: [resolve(packageRoot, "src/launcher.ts")],
  outfile: resolve(libRoot, "client.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  logLevel: "info",
});
execFileSync(vite, ["build", "--config", resolve(packageRoot, "vite.config.ts")], { cwd: packageRoot, stdio: "inherit" });
execFileSync(vite, ["build", "--config", resolve(packageRoot, "vite.embed.config.ts")], { cwd: packageRoot, stdio: "inherit" });

console.log("built mtm-admin standalone, embed, and launcher artifacts");
