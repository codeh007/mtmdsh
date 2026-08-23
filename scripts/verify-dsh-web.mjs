#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const argumentsList = process.argv.slice(2);
const tarballArg = argumentsList[0] === "--" ? argumentsList[1] : argumentsList[0];
const fail = (message) => { throw new Error(message); };
if (!tarballArg) fail("usage: node scripts/verify-dsh-web.mjs <package-tarball>");
const tarball = resolve(tarballArg);

const dsh = process.env.DSH_BIN ?? "dsh";
const home = mkdtempSync(join(tmpdir(), "mtm-codebase-memory-dsh-"));
const port = Number(process.env.DSH_SMOKE_PORT ?? 0) || 3197;
const env = { ...process.env, DSH_HOME: home };
let child;

function run(args) {
  const result = spawnSync(dsh, args, { cwd: process.cwd(), env, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(dsh + " " + args.join(" ") + " failed (exit " + result.status + "):\n" + result.stdout + "\n" + result.stderr);
  }
  return result.stdout;
}

function parseJsonResponse(text, label) {
  let value;
  try { value = JSON.parse(text); } catch (error) { throw new Error(label + " returned invalid JSON", { cause: error }); }
  if (value?.type !== "server-response" || value?.result?.ok !== true) {
    throw new Error(label + " returned an unsuccessful response: " + text);
  }
  return value.result.value;
}

async function waitForWeb() {
  const deadline = Date.now() + 120_000;
  let output = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/");
      if (response.ok) return output;
    } catch {
      // The host is still booting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("DSH Web did not become ready:\n" + output);
}

async function stopWeb() {
  if (!child) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 10_000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function readInventory() {
  const response = await fetch("http://127.0.0.1:" + port + "/api/pluginInventory/list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: "mtm-codebase-memory-inventory",
      method: "pluginInventory/list",
      payload: { args: {} },
    }),
  });
  return parseJsonResponse(await response.text(), "plugin inventory");
}

async function waitForCbm() {
  const deadline = Date.now() + 180_000;
  let lastEntry;
  while (Date.now() < deadline) {
    try {
      const inventory = await readInventory();
      lastEntry = inventory.entries.find((entry) => entry.moduleName === "mtm-codebase-memory");
      if (lastEntry?.fiberPhase === "active") return lastEntry;
      if (lastEntry?.fiberPhase === "failed") throw new Error("CBM plugin failed in the Web host");
    } catch (error) {
      if (error instanceof Error && error.message === "CBM plugin failed in the Web host") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("CBM plugin did not become active; last entry: " + JSON.stringify(lastEntry));
}

try {
  run(["plugin", "--profile", "web", "add", tarball]);
  const dump = run(["--profile", "web", "--dump-config"]);
  if (!dump.includes("name: mtm-codebase-memory")) fail("profile dump did not include the CBM plugin row");

  child = spawn(dsh, ["web", "--no-open", "--port", String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout?.on("data", (chunk) => { logs += String(chunk); });
  child.stderr?.on("data", (chunk) => { logs += String(chunk); });
  await waitForWeb();
  const cbmEntry = await waitForCbm();

  const listResponse = await fetch("http://127.0.0.1:" + port + "/api/session.list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: "mtm-codebase-memory-session-list",
      method: "session.list",
      payload: {},
    }),
  });
  const sessions = parseJsonResponse(await listResponse.text(), "session.list");
  if (!Array.isArray(sessions.items)) fail("session.list returned no items array");

  const createResponse = await fetch("http://127.0.0.1:" + port + "/api/session.create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: "mtm-codebase-memory-session-create",
      method: "session.create",
      payload: { cwd: process.cwd() },
    }),
  });
  const created = parseJsonResponse(await createResponse.text(), "session.create");
  if (typeof created.sessionId !== "string") fail("session.create returned no session id");

  console.log(JSON.stringify({
    profile: home,
    plugin: cbmEntry,
    sessionCount: sessions.items.length,
    createdSessionId: created.sessionId,
    logs: logs.split("\n").filter((line) => line.includes("dsh web:") || line.includes("mtm-codebase-memory")).slice(-10),
  }));
} finally {
  await stopWeb();
  if (process.env.KEEP_DSH_SMOKE !== "1") rmSync(home, { recursive: true, force: true });
}
