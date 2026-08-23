import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import {
  extractHookContext,
  resolveBundledCommand,
  resolveCommand,
  resolveEnvironment,
  resolveWorkingDirectory,
} from "../dist/runtime.js";
import {
  buildMcpConfig,
  resolveConfig,
} from "../dist/index.js";

test("resolves the pinned lazy runtime without a PATH executable", () => {
  const command = resolveBundledCommand();
  assert.equal(command.command, process.execPath);
  assert.match(command.args[0], /npm[/\\]bin[/\\]npx-cli\.js$/);
  assert.deepEqual(command.args.slice(1, 5), ["--yes", "--package", "codebase-memory-mcp@0.10.8", "codebase-memory-mcp"]);
  assert.equal(command.bundled, true);
  assert.throws(() => resolveBundledCommand(() => { throw new Error("missing"); }), /npm CLI is unavailable/);
});

test("explicit command remains an opt-in override", () => {
  assert.deepEqual(resolveCommand("/usr/bin/cbm", ["--ui"]), {
    command: "/usr/bin/cbm",
    args: ["--ui"],
    bundled: false,
  });
});

test("normalizes working directory and explicit CBM environment", () => {
  const cwd = resolveWorkingDirectory(".");
  assert.equal(cwd.startsWith("/"), true);
  assert.deepEqual(resolveEnvironment({ CBM_LOG_LEVEL: "warn" }, "./cache", "./repo"), {
    CBM_LOG_LEVEL: "warn",
    CBM_CACHE_DIR: join(process.cwd(), "cache"),
    CBM_ALLOWED_ROOT: join(process.cwd(), "repo"),
  });
});

test("hook output is fail-open and supports DSH-compatible envelopes", () => {
  assert.equal(extractHookContext(""), undefined);
  assert.equal(extractHookContext("not json"), undefined);
  assert.equal(extractHookContext(JSON.stringify({ additionalContext: "direct" })), "direct");
  assert.equal(extractHookContext(JSON.stringify({ systemMessage: "system" })), "system");
  assert.equal(extractHookContext(JSON.stringify({ hookSpecificOutput: { additionalContext: "nested" } })), "nested");
});

test("config defaults are deterministic and MCP config uses the resolved command", () => {
  const config = resolveConfig({ cwd: ".", env: { CBM_LOG_LEVEL: "warn" } });
  assert.equal(config.serverName, "codebase_memory");
  assert.equal(config.ensureRuntime, true);
  assert.equal(config.augmentHooks, true);
  const mcp = buildMcpConfig(config, {
    command: process.execPath,
    args: ["/tmp/cbm/bin.js"],
    bundled: true,
  }, config.env);
  assert.equal(mcp.transport, "stdio");
  assert.equal(mcp.command, process.execPath);
  assert.deepEqual(mcp.args, ["/tmp/cbm/bin.js"]);
  assert.equal(mcp.cwd, config.cwd);
});

test("config rejects unsafe namespaces and applies timeout-specific bounds", () => {
  assert.throws(() => resolveConfig({ serverName: "bad namespace" }), /invalid serverName/);
  assert.throws(() => resolveConfig({ hookTimeoutMs: 0 }), /hookTimeoutMs/);
  assert.throws(() => resolveConfig({ hookTimeoutMs: 10_001 }), /hookTimeoutMs/);
  assert.throws(() => resolveConfig({ runtimeCheckTimeoutMs: 300_001 }), /runtimeCheckTimeoutMs/);
  assert.equal(resolveConfig({ toolCallTimeoutMs: 600_000 }).toolCallTimeoutMs, 600_000);
});
