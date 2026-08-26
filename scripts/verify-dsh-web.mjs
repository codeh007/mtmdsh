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
const home = mkdtempSync(join(tmpdir(), "mtmharness-dsh-"));
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
      rpcId: "mtmharness-inventory",
      method: "pluginInventory/list",
      payload: { args: {} },
    }),
  });
  return parseJsonResponse(await response.text(), "plugin inventory");
}

async function waitForPlugin() {
  const deadline = Date.now() + 180_000;
  let lastEntry;
  while (Date.now() < deadline) {
    try {
      const inventory = await readInventory();
      lastEntry = inventory.entries.find((entry) => entry.moduleName === "mtmharness");
      if (lastEntry?.fiberPhase === "active") return lastEntry;
      if (lastEntry?.fiberPhase === "failed") throw new Error("CBM plugin failed in the Web host");
    } catch (error) {
      if (error instanceof Error && error.message === "CBM plugin failed in the Web host") throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("CBM plugin did not become active; last entry: " + JSON.stringify(lastEntry));
}

async function rpc(path, method, payload, rpcId) {
  const response = await fetch("http://127.0.0.1:" + port + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId, method, payload }),
  });
  return parseJsonResponse(await response.text(), method);
}

async function verifyCodingSettings() {
  const settings = await rpc("/api/settings.describe", "settings.describe", {}, "mtmharness-settings-describe");
  const namespace = settings.namespaces?.find((entry) => entry.ns === "mtm-coding");
  if (namespace === undefined) fail("settings.describe did not include the mtm-coding namespace");
  if (namespace.value?.serverName !== "codebase_memory") {
    fail("mtm-coding settings did not preserve the codebase_memory server namespace");
  }
  return {
    namespace: namespace.ns,
    serverName: namespace.value.serverName,
    ponytailMode: namespace.value.ponytailMode,
  };
}

async function verifyToolCatalog(sessionId) {
  await rpc("/api/session.prompt", "session.prompt", {
    sessionId,
    mode: "queue",
    content: [{ type: "text", text: "Tool catalog smoke test. Reply READY without calling any tool." }],
  }, "mtmharness-tool-catalog-prompt");
  const deadline = Date.now() + 120_000;
  let lastNames = [];
  while (Date.now() < deadline) {
    try {
      const history = await rpc("/api/session.history", "session.history", { sessionId, maxMessages: 100 }, "mtmharness-tool-catalog-history");
      const header = history.events
        .map((entry) => entry.event)
        .find((event) => event.type === "request/header")?.data?.header;
      const names = Array.isArray(header?.tools) ? header.tools.map((tool) => tool.name) : undefined;
      if (names !== undefined) {
        lastNames = names;
        const mcpNames = names.filter((name) => name.startsWith("mcp__codebase_memory__"));
        if (!names.includes("mcp__codebase_memory__list_projects")) {
          throw new Error("tool catalog is missing mcp__codebase_memory__list_projects: " + JSON.stringify(mcpNames));
        }
        return { toolCount: names.length, mcpToolCount: mcpNames.length };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("tool catalog is missing")) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("tool catalog did not arrive; last names: " + JSON.stringify(lastNames));
}

try {
  run(["plugin", "--profile", "web", "add", tarball]);
  const dump = run(["--profile", "web", "--dump-config"]);
  if (!dump.includes("name: mtmharness")) fail("profile dump did not include the unified mtmharness plugin row");

  child = spawn(dsh, ["web", "--no-open", "--port", String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout?.on("data", (chunk) => { logs += String(chunk); });
  child.stderr?.on("data", (chunk) => { logs += String(chunk); });
  await waitForWeb();
  const pluginEntry = await waitForPlugin();
  const codingSettings = await verifyCodingSettings();

  const listResponse = await fetch("http://127.0.0.1:" + port + "/api/session.list", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "client-request",
      rpcId: "mtmharness-session-list",
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
      rpcId: "mtmharness-session-create",
      method: "session.create",
      payload: { cwd: process.cwd() },
    }),
  });
  const created = parseJsonResponse(await createResponse.text(), "session.create");
  if (typeof created.sessionId !== "string") fail("session.create returned no session id");
  const toolCatalog = process.env.DSH_SMOKE_TOOL_CATALOG === "1"
    ? await verifyToolCatalog(created.sessionId)
    : undefined;

  console.log(JSON.stringify({
    profile: home,
    plugin: pluginEntry,
    sessionCount: sessions.items.length,
    createdSessionId: created.sessionId,
    codingSettings,
    ...toolCatalog === undefined ? {} : { toolCatalog },
    logs: logs.split("\n").filter((line) => line.includes("dsh web:") || line.includes("mtmharness")).slice(-10),
  }));
} finally {
  await stopWeb();
  if (process.env.KEEP_DSH_SMOKE !== "1") rmSync(home, { recursive: true, force: true });
}
