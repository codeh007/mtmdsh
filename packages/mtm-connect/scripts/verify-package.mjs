#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const fail = (message) => { throw new Error("mtm-connect package: " + message); };

if (manifest.private === true) fail("package must be publishable");
if (manifest.name !== "mtm-connect") fail("unexpected package name");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail("version must be stable SemVer");
if (manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") fail("dsh.bundle.patch must point to cordis.patch.yml");
if (manifest.dsh?.client?.platform !== "web") fail("dsh.client.platform must be web");
if (!Array.isArray(manifest.dsh?.client?.inject)) fail("dsh.client.inject must be an array");
if (!manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-connection")) fail("dsh.client.inject must include the DSH Connection carrier");
if (manifest.exports?.["./client"]?.default !== "./lib/client.js") fail("exports ./client must point to lib/client.js");
if (manifest.exports?.["."]?.default !== "./lib/index.js") fail("exports root must point to lib/index.js");
for (const path of ["cordis.patch.yml", "lib/index.js", "lib/client.js", "lib/types/index.d.ts", "lib/types/client/index.d.ts"]) {
  if (!existsSync(resolve(packageRoot, path))) fail("missing build output " + path);
}
const patch = readFileSync(resolve(packageRoot, "cordis.patch.yml"), "utf8");
if (!patch.includes("id: mtm-connect") || !patch.includes("name: mtm-connect")) fail("profile patch must insert the mtm-connect Loader row");
const client = readFileSync(resolve(packageRoot, "lib/client.js"), "utf8");
if (!client.includes("window.__ModuleLoader__.load") || !client.includes('id: "mtm-connect"')) fail("client artifact is not a DSH lazy-CJS bundle");
if (!client.includes("/mtm-connect")) fail("client artifact does not include the Host Connection RPC channel");
for (const forbidden of ["createRoot", "RouterProvider", "new WebSocket", 'credentials: "include"', "dynamic-import"]) {
  if (client.includes(forbidden)) fail("client artifact contains forbidden standalone behavior: " + forbidden);
}

const tarball = process.argv[2];
if (tarball !== undefined) {
  const entries = execFileSync("tar", ["-tzf", resolve(tarball)], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => entry.startsWith("package/") && !entry.endsWith("/"))
    .sort();
  const required = [
    "package/LICENSE",
    "package/README.md",
    "package/cordis.patch.yml",
    "package/lib/client.js",
    "package/lib/index.js",
    "package/lib/types/client/index.d.ts",
    "package/lib/types/index.d.ts",
    "package/package.json",
  ];
  for (const entry of required) if (!entries.includes(entry)) fail("tarball is missing " + entry);
  if (entries.some((entry) => entry.includes(".test."))) fail("tarball must not contain test declarations");
}

console.log("verified mtm-connect@" + manifest.version + (tarball === undefined ? "" : " tarball"));
