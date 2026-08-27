#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const fail = (message) => { throw new Error("mtmharness package: " + message); };
const read = (path) => readFileSync(resolve(packageRoot, path), "utf8");
const requirePath = (path) => { if (!existsSync(resolve(packageRoot, path))) fail("missing build output " + path); };

if (manifest.private === true) fail("package must be publishable");
if (manifest.name !== "mtmharness") fail("unexpected package name");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail("version must be stable SemVer");
if (manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") fail("dsh.bundle.patch must point to cordis.patch.yml");
if (manifest.dsh?.client?.platform !== "web") fail("dsh.client.platform must be web");
const expectedInject = [
  "@deepseek-ai/dsh-client-connection",
  "@deepseek-ai/dsh-client-ui-renderer",
  "@deepseek-ai/dsh-client-ui-sidebar",
  "@deepseek-ai/dsh-client-ui-layout",
  "@deepseek-ai/dsh-client-locale",
  "@deepseek-ai/dsh-client-ui-settings",
  "@deepseek-ai/dsh-client-ui-settings-plugins",
];
if (JSON.stringify(manifest.dsh?.client?.inject) !== JSON.stringify(expectedInject)) {
  fail("dsh.client.inject must exactly match " + JSON.stringify(expectedInject));
}
if (manifest.exports?.["./client"]?.default !== "./lib/client.cjs") fail("exports ./client must point to lib/client.cjs");
if (manifest.exports?.["./embed"]?.import !== "./dist/embed/mtmharness.js") fail("exports ./embed must point to the ESM artifact");
if (manifest.exports?.["./app"] !== "./dist/standalone/index.html") fail("exports ./app must point to the static app");
if (manifest.unpkg !== "./dist/embed/mtmharness.iife.js") fail("unpkg must point to the IIFE embed artifact");
if (manifest.jsdelivr !== "./dist/embed/mtmharness.iife.js") fail("jsdelivr must point to the IIFE embed artifact");

for (const path of [
  "cordis.patch.yml",
  "lib/index.js",
  "lib/client.js",
  "lib/client.cjs",
  "lib/types/index.d.ts",
  "lib/types/client/index.d.ts",
  "lib/types/features/coding/index.d.ts",
  "dist/standalone/index.html",
  "dist/standalone/config.js",
  "dist/embed/mtmharness.js",
  "dist/embed/mtmharness.iife.js",
  "dist/types/standalone/index.d.ts",
]) requirePath(path);

const patch = read("cordis.patch.yml");
if (!patch.includes("id: mtmharness") || !patch.includes("name: mtmharness") || !patch.includes("serverName: codebase_memory")) {
  fail("profile patch must insert the mtmharness Loader row with the Codebase Memory namespace");
}

const host = read("lib/index.js");
for (const required of ["mtm-coding", "codebase_memory", "mtm-coding-ponytail", "mtm-coding-rtk", "RTK_VERSION"]) {
  if (!host.includes(required)) fail("Host artifact is missing coding feature: " + required);
}

const client = read("lib/client.js");
if (!client.includes("window.__ModuleLoader__.load") || !client.includes('id: "mtmharness"')) fail("client artifact is not a DSH lazy-CJS bundle");
for (const required of [
  "/mtm-connect",
  "mtm-coding",
  "mtm.coding",
  "ponytail",
  "rtkMode",
  "RTK",
  "shell.overlay",
  "mtmdsh-launcher-overlay",
  "https://unpkg.com/mtmharness@latest/dist/standalone/index.html",
]) {
  if (!client.includes(required)) fail("client artifact is missing unified feature surface: " + required);
}
for (const forbidden of ["createRoot", "RouterProvider", "new WebSocket", 'credentials: "include"', "MtmHarnessRuntime", "standalone/src", 'id: "mtm-connect"', "/mtmdsh/"]) {
  if (client.includes(forbidden)) fail("client artifact contains standalone behavior: " + forbidden);
}

const app = read("dist/standalone/index.html");
if (!app.includes("<script") || !app.includes("assets/")) fail("static app entry does not reference built assets");
const staticConfig = read("dist/standalone/config.js");
for (const required of ["https://gomtm-dev.yuepa8.com", "mtmharness-web-v1", "window.location.origin + window.location.pathname"]) {
  if (!staticConfig.includes(required)) fail("static app config is missing CDN OAuth bootstrap: " + required);
}
const embed = read("dist/embed/mtmharness.js");
const embedIife = read("dist/embed/mtmharness.iife.js");
const appJsName = readdirSync(resolve(packageRoot, "dist/standalone/assets")).find((name) => name.endsWith(".js"));
if (appJsName === undefined) fail("static app JavaScript is missing");
const appJs = read("dist/standalone/assets/" + appJsName);
if (!app.includes("Content-Security-Policy") || !app.includes("frame-ancestors")) fail("static app entry is missing its CSP hosting contract");
if (!embed.includes("window.MtmHarnessClient") || !embed.includes("initialEntries") || !embed.includes("attachShadow")) fail("ESM embed artifact is missing its public entry contract");
if (!embedIife.includes("window.MtmHarnessClient") || !embedIife.includes("attachShadow") || !embedIife.includes("mtmharnessMounted")) fail("IIFE embed artifact is missing its global mount contract");
for (const artifact of [appJs, embed, embedIife]) {
  for (const required of ["/api/dsh/ws-ticket", "dsh-ticket.", ".well-known/openid-configuration"]) {
    if (!artifact.includes(required)) fail("standalone artifact is missing OAuth/ticket behavior: " + required);
  }
  for (const forbidden of ['credentials: "include"', "/api/auth/sign-in/anonymous", "authLoginUrl", "authRegisterUrl", "data-access-token", "?access_token=", "?ticket="]) {
    if (artifact.includes(forbidden)) fail("standalone artifact contains an unsafe auth path: " + forbidden);
  }
}

const tarball = process.argv[2];
if (tarball !== undefined) {
  const entries = execFileSync("tar", ["-tzf", resolve(tarball)], { encoding: "utf8" })
    .split("\n")
    .filter((entry) => entry.startsWith("package/") && !entry.endsWith("/"));
  const required = [
    "package/LICENSE",
    "package/README.md",
    "package/cordis.patch.yml",
    "package/lib/client.js",
    "package/lib/client.cjs",
    "package/lib/index.js",
    "package/lib/types/client/index.d.ts",
    "package/lib/types/index.d.ts",
    "package/lib/types/features/coding/index.d.ts",
    "package/dist/standalone/index.html",
    "package/dist/standalone/config.js",
    "package/dist/embed/mtmharness.js",
    "package/dist/embed/mtmharness.iife.js",
    "package/dist/types/standalone/index.d.ts",
    "package/scripts/profile-migration.mjs",
    "package/package.json",
  ];
  for (const entry of required) if (!entries.includes(entry)) fail("tarball is missing " + entry);
  if (!entries.some((entry) => entry.startsWith("package/dist/standalone/assets/") && entry.endsWith(".js"))) fail("tarball is missing static app JavaScript");
  if (!entries.some((entry) => entry.startsWith("package/dist/standalone/assets/") && entry.endsWith(".css"))) fail("tarball is missing static app CSS");
  if (entries.some((entry) => entry.includes(".test."))) fail("tarball must not contain test declarations");
  if (entries.some((entry) => entry.includes("standalone/src/"))) fail("tarball must not contain standalone source files");
}

console.log("verified mtmharness@" + manifest.version + (tarball === undefined ? "" : " tarball"));
