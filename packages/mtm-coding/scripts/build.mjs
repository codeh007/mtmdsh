#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const distRoot = resolve(packageRoot, "dist");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
const packageName = "mtm-coding";

rmSync(distRoot, { recursive: true, force: true });
mkdirSync(distRoot, { recursive: true });
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });

const clientTemp = resolve(distRoot, "client.bundle.cjs");
const clientBuild = await build({
  entryPoints: [resolve(packageRoot, "src/client/index.tsx")],
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
if (clientInputs.some((input) => input.includes("node_modules/@deepseek-ai/dsh-client-ui-settings-plugins/src/"))) {
  throw new Error("mtm-coding build: client bundle reached private DSH source files");
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
writeFileSync(resolve(distRoot, "client.cjs"), artifact);
writeFileSync(resolve(distRoot, "client.js"), artifact);
rmSync(clientTemp, { force: true });
console.log("built mtm-coding Host and Web client artifacts");
