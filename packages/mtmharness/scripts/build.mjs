#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const libRoot = resolve(packageRoot, "lib");
const distRoot = resolve(packageRoot, "dist");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
const vite = resolve(packageRoot, "node_modules/.bin/vite");
const clientTemp = resolve(libRoot, "client.bundle.cjs");
const packageName = "mtmharness";

rmSync(libRoot, { recursive: true, force: true });
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc) || !existsSync(vite)) throw new Error("mtmharness build: local TypeScript and Vite executables are required");

execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.standalone.json")], { cwd: packageRoot, stdio: "inherit" });

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(libRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  target: "es2022",
  logLevel: "info",
});

const clientBuild = await build({
  entryPoints: [resolve(packageRoot, "src/client/index.ts")],
  outfile: clientTemp,
  bundle: true,
  metafile: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["react", "react/*", "@deepseek-ai/*"],
  legalComments: "none",
  logLevel: "info",
});
const clientInputs = Object.keys(clientBuild.metafile?.inputs ?? {});
const standaloneInputs = clientInputs.filter((input) => input.includes("standalone/") || input.includes("standalone\\"));
if (standaloneInputs.length > 0) {
  throw new Error("mtmharness build: DSH client entry imports standalone sources: " + standaloneInputs.join(", "));
}

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
  throw new Error("mtmharness build: generated client artifact does not have the DSH loader contract");
}
writeFileSync(resolve(libRoot, "client.js"), artifact);
writeFileSync(resolve(libRoot, "client.cjs"), artifact);
rmSync(clientTemp, { force: true });

execFileSync(vite, ["build", "--config", resolve(packageRoot, "vite.standalone.config.ts")], { cwd: packageRoot, stdio: "inherit" });
execFileSync(vite, ["build", "--config", resolve(packageRoot, "vite.embed.config.ts")], { cwd: packageRoot, stdio: "inherit" });

console.log("built mtmharness plugin, standalone app, and embed artifacts");
