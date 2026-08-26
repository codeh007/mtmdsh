#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const fail = (message) => { throw new Error("mtm-coding package: " + message); };
const read = (path) => readFileSync(resolve(packageRoot, path), "utf8");
const requirePath = (path) => { if (!existsSync(resolve(packageRoot, path))) fail("missing build output " + path); };

if (manifest.private === true) fail("package must be publishable");
if (manifest.name !== "mtm-coding") fail("unexpected package name: " + manifest.name);
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail("version must be stable SemVer");
if (manifest.main !== "./dist/index.js" || manifest.types !== "./dist/index.d.ts") fail("main/types must expose dist/index");
if (manifest.exports?.["./client"]?.default !== "./dist/client.cjs") fail("exports ./client must point to dist/client.cjs");
if (manifest.exports?.["./client"]?.types !== "./dist/client/index.d.ts") fail("exports ./client types must point to dist/client declarations");
if (manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") fail("dsh.bundle.patch must point to cordis.patch.yml");
if (manifest.dsh?.client?.platform !== "web") fail("dsh.client.platform must be web");
const expectedInject = [
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-runtime",
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-ui-settings-plugins",
  "@deepseek-ai/dsh-client-ui-slots",
];
if (JSON.stringify(manifest.dsh?.client?.inject) !== JSON.stringify(expectedInject)) fail("dsh.client.inject does not match the client contract");
if (manifest.files?.includes("skills")) fail("runtime skills must be embedded, not shipped as a directory");

for (const path of [
  "LICENSE",
  "README.md",
  "cordis.patch.yml",
  "dist/index.js",
  "dist/index.d.ts",
  "dist/runtime.js",
  "dist/runtime.d.ts",
  "dist/client.js",
  "dist/client.cjs",
  "dist/client/index.d.ts",
  "dist/features/ponytail-skills.js",
]) requirePath(path);

const patch = read("cordis.patch.yml");
if (!patch.includes("id: mtm-coding") || !patch.includes("name: 'mtm-coding'")) fail("profile patch must insert mtm-coding");
if (patch.includes("mtm-codebase-memory")) fail("profile patch contains the retired package id");
const ponytail = read("dist/features/ponytail.js");
const skillBundle = read("dist/features/ponytail-skills.js");
if (ponytail.includes("node:fs") || ponytail.includes("skills/")) fail("Ponytail runtime still depends on skill files");
for (const name of ["ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"]) {
  if (!skillBundle.includes(name)) fail("embedded skill is missing: " + name);
}
const client = read("dist/client.js");
if (!client.includes("window.__ModuleLoader__.load") || !client.includes('id: "mtm-coding"')) fail("client artifact is not a mtm-coding lazy-CJS bundle");
if (client.includes("node:fs") || client.includes("skills/")) fail("client artifact contains Host-only skill loading");

const tarball = process.argv[2];
if (tarball !== undefined) {
  const entries = execFileSync("tar", ["-tzf", resolve(tarball)], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => entry.startsWith("package/") && !entry.endsWith("/"));
  for (const required of [
    "package/LICENSE",
    "package/README.md",
    "package/cordis.patch.yml",
    "package/package.json",
    "package/dist/index.js",
    "package/dist/index.d.ts",
    "package/dist/runtime.js",
    "package/dist/runtime.d.ts",
    "package/dist/client.js",
    "package/dist/client.cjs",
    "package/dist/client/index.d.ts",
    "package/dist/features/ponytail-skills.js",
  ]) if (!entries.includes(required)) fail("tarball is missing " + required);
  if (entries.some((entry) => entry.startsWith("package/skills/"))) fail("tarball contains external skill files");
  if (entries.some((entry) => entry.includes(".test."))) fail("tarball contains tests");
}

console.log("verified mtm-coding@" + manifest.version + (tarball === undefined ? "" : " tarball"));
