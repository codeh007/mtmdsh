#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const tarballArg = process.argv.slice(2).find((argument) => argument !== "--");
if (tarballArg === undefined) throw new Error("usage: profile-migration.mjs <mtmharness-tarball>");

const tarball = resolve(process.cwd(), tarballArg);
if (!existsSync(tarball)) throw new Error("mtmharness profile: tarball does not exist: " + tarball);

const dshPackage = process.env.DSH_PACKAGE ?? "@deepseek-ai/dsh@0.1.2-alpha.1";
const root = mkdtempSync(join(tmpdir(), "mtmharness-profile-"));
const dshHome = join(root, "dsh-home");
const legacyRoot = join(root, "legacy");
mkdirSync(legacyRoot, { recursive: true });

function createLegacyFixture(name) {
  const directory = join(legacyRoot, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "package.json"), JSON.stringify({
    name,
    version: "0.0.0",
    private: true,
    type: "module",
    files: ["cordis.patch.yml", "package.json"],
    dsh: { bundle: { patch: "./cordis.patch.yml" } },
  }, null, 2) + "\n");
  writeFileSync(join(directory, "cordis.patch.yml"), [
    "- insert:",
    "    - id: " + name,
    "      name: " + name,
    "",
  ].join("\n"));
  return directory;
}

const legacyCanvas = createLegacyFixture("mtmcanvas");
const legacyConnect = createLegacyFixture("mtm-connect");
const legacyCoding = createLegacyFixture("mtm-coding");
const env = { ...process.env, DSH_HOME: dshHome };

function runDsh(args, capture = false) {
  return execFileSync("pnpm", ["dlx", dshPackage, ...args], {
    cwd: packageRoot,
    env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
}

function dumpConfig() {
  return runDsh(["--profile", "web", "--dump-config"], true);
}

function assertRows(dump, expected) {
  const managed = new Set(["mtmcanvas", "mtm-connect", "mtm-coding", "mtmharness"]);
  const rows = [...dump.matchAll(/^# == ([^\n]+)$/gmu)]
    .map((match) => match[1])
    .filter((name) => managed.has(name));
  if (rows.length !== expected.length || expected.some((name, index) => rows[index] !== name)) {
    throw new Error("mtmharness profile rows mismatch; expected " + JSON.stringify(expected) + ", got " + JSON.stringify(rows));
  }
}

try {
  runDsh(["plugin", "--profile", "web", "add", legacyCanvas]);
  runDsh(["plugin", "--profile", "web", "add", legacyConnect]);
  runDsh(["plugin", "--profile", "web", "add", legacyCoding]);
  assertRows(dumpConfig(), ["mtmcanvas", "mtm-connect", "mtm-coding"]);

  runDsh(["plugin", "--profile", "web", "remove", "mtmcanvas"]);
  runDsh(["plugin", "--profile", "web", "remove", "mtm-connect"]);
  runDsh(["plugin", "--profile", "web", "remove", "mtm-coding"]);
  runDsh(["plugin", "--profile", "web", "add", tarball]);
  assertRows(dumpConfig(), ["mtmharness"]);

  runDsh(["plugin", "--profile", "web", "add", tarball]);
  assertRows(dumpConfig(), ["mtmharness"]);

  runDsh(["plugin", "--profile", "web", "remove", "mtmharness"]);
  assertRows(dumpConfig(), []);

  runDsh(["plugin", "--profile", "web", "add", tarball]);
  assertRows(dumpConfig(), ["mtmharness"]);
  console.log("verified mtmharness profile migration, duplicate install, removal, and reinstall");
} finally {
  rmSync(root, { recursive: true, force: true });
}
