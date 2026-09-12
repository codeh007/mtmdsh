#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const libRoot = resolve(packageRoot, "lib");
const distRoot = resolve(packageRoot, "dist");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
const vite = resolve(packageRoot, "node_modules/.bin/vite");
const clientTemp = resolve(libRoot, "client.bundle.cjs");
const packageName = "mtmharness";
const packageManifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));

function packageExport(subpath, condition = "default") {
  const definition = packageManifest.exports?.[subpath];
  const target = typeof definition === "string" ? definition : definition?.[condition] ?? definition?.default;
  if (typeof target !== "string") throw new Error("mtmharness build: package export " + subpath + " has no " + condition + " target");
  return resolve(packageRoot, target);
}

function packageField(field) {
  const target = packageManifest[field];
  if (typeof target !== "string") throw new Error("mtmharness build: package field " + field + " has no target");
  return resolve(packageRoot, target);
}

function requireOutput(label, output) {
  if (!existsSync(output)) throw new Error("mtmharness build: " + label + " output is missing (" + relative(packageRoot, output) + ")");
}

const hostOutput = packageExport(".");
const hostTypes = packageExport(".", "types");
const clientOutput = packageExport("./client");
const clientTypes = packageExport("./client", "types");
const embedOutput = packageExport("./embed", "import");
const embedTypes = packageExport("./embed", "types");
const authOutput = packageExport("./auth", "import");
const authTypes = packageExport("./auth", "types");
const p2pWorkerOutput = packageExport("./p2p-worker");
const p2pWorkerTypes = packageExport("./p2p-worker", "types");
const embedIifeOutput = packageField("unpkg");
const embedJsdelivrOutput = packageField("jsdelivr");

rmSync(libRoot, { recursive: true, force: true });
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc) || !existsSync(vite)) throw new Error("mtmharness build: local TypeScript and Vite executables are required");

execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });
requireOutput("Host declarations", hostTypes);
requireOutput("client declarations", clientTypes);
requireOutput("p2p worker declarations", p2pWorkerTypes);

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: hostOutput,
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  target: "es2022",
  logLevel: "info",
});

await build({
  entryPoints: [resolve(packageRoot, "src/embed/app/auth.ts")],
  outfile: authOutput,
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  logLevel: "info",
});

await build({
  entryPoints: [resolve(packageRoot, "src/features/p2p/worker.ts")],
  outfile: p2pWorkerOutput,
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
writeFileSync(clientOutput, artifact);
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
for (const [label, output] of [
  ["Host plugin", hostOutput],
  ["Host declarations", hostTypes],
  ["DSH client", clientOutput],
  ["client declarations", clientTypes],
  ["embed ESM", embedOutput],
  ["embed IIFE", embedIifeOutput],
  ["embed jsDelivr", embedJsdelivrOutput],
  ["embed declarations", embedTypes],
  ["auth ESM", authOutput],
  ["auth declarations", authTypes],
  ["p2p worker", p2pWorkerOutput],
  ["p2p worker declarations", p2pWorkerTypes],
]) requireOutput(label, output);

console.log("built mtmharness plugin and embed artifacts");
