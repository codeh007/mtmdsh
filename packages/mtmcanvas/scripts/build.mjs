#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const libRoot = resolve(packageRoot, "lib");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
const clientTemp = resolve(libRoot, "client.cjs");
const packageName = "mtmcanvas";

rmSync(libRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc)) throw new Error("mtmcanvas build: local TypeScript executable is missing");
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(libRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  logLevel: "info",
});

await build({
  entryPoints: [resolve(packageRoot, "src/client/index.ts")],
  outfile: clientTemp,
  bundle: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["react", "react/*", "@deepseek-ai/*"],
  legalComments: "none",
  logLevel: "info",
});

const clientSource = readFileSync(clientTemp, "utf8");
const indented = clientSource.split("\n").map((line) => "    " + line).join("\n");
const artifact = [
  "window.__ModuleLoader__.load({",
  "  id: " + JSON.stringify(packageName) + ",",
  "  factory: (require) => {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
  indented,
  "    return module.exports;",
  "  }",
  "});",
  "",
].join("\n");
if (!artifact.includes("window.__ModuleLoader__.load") || !artifact.includes("id: \"" + packageName + "\"")) {
  throw new Error("mtmcanvas build: generated client artifact does not have the DSH loader contract");
}
writeFileSync(resolve(libRoot, "client.js"), artifact);
rmSync(clientTemp, { force: true });

console.log("built mtmcanvas Host and Client artifacts");
