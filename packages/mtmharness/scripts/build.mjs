#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
const workspaceRoot = resolve(packageRoot, "..");

rmSync(libRoot, { recursive: true, force: true });
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc) || !existsSync(vite)) throw new Error("mtmharness build: local TypeScript and Vite executables are required");

execFileSync("pnpm", ["--filter", "mtmcanvas", "run", "build"], { cwd: workspaceRoot, stdio: "inherit" });
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });

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

await build({
  entryPoints: [resolve(packageRoot, "src/embed/app/auth.ts")],
  outfile: resolve(distRoot, "auth.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  logLevel: "info",
});

await build({
  entryPoints: [resolve(packageRoot, "src/features/p2p/worker.ts")],
  outfile: resolve(libRoot, "p2p-worker.cjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
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
const embedInputs = clientInputs.filter((input) => input.includes("src/embed/") || input.includes("src\\embed\\"));
if (embedInputs.length > 0) {
  throw new Error("mtmharness build: DSH client entry imports embed sources: " + embedInputs.join(", "));
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

execFileSync(vite, ["build", "--config", resolve(packageRoot, "vite.embed.config.ts")], { cwd: packageRoot, stdio: "inherit" });

execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.embed.json")], { cwd: packageRoot, stdio: "inherit" });

function normalizeDeclarationImports(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      normalizeDeclarationImports(filePath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith(".d.ts")) continue;
    const source = readFileSync(filePath, "utf8");
    const normalized = source.replace(/(["'])(\.\.?\/[^"']+)\1/gu, (match, quote, specifier) =>
      /\.[^/]+$/u.test(specifier) ? match : quote + specifier + ".js" + quote);
    if (normalized !== source) writeFileSync(filePath, normalized);
  }
}

normalizeDeclarationImports(resolve(distRoot, "types/embed"));

console.log("built mtmharness plugin and embed artifacts");
