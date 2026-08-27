import assert from "node:assert/strict";
import { deflateRawSync, gzipSync } from "node:zlib";
import { join } from "node:path";
import test from "node:test";
import {
  ensureRuntime,
  extractRtkBinary,
  extractHookContext,
  extractNativeCommand,
  resolveBundledCommand,
  resolveCommand,
  resolveEnvironment,
  resolveWorkingDirectory,
  RTK_VERSION,
  bindRtkExecutable,
  bashInput,
  rewriteRtk,
  rtkAssetFor,
  rtkAssetUrl,
  rtkEnvironment,
  rtkDisabled,
} from "../lib/index.js";
import {
  buildMcpConfig,
  resolveConfig,
} from "../lib/index.js";

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

test("resolves the native binary for the long-lived MCP connection", async () => {
  const specs = [];
  const fake = {
    subprocess: {
      spawn(spec) {
        specs.push(spec);
        const reader = { readFrom: () => ({ text: process.execPath, nextOffset: process.execPath.length, lossy: false }) };
        return {
          collected: { stdout: reader, stderr: { readFrom: () => ({ text: "", nextOffset: 0, lossy: false }) } },
          done: Promise.resolve({ exitCode: 0, signal: null }),
          terminate() {},
        };
      },
    },
  };
  const resolved = await ensureRuntime(
    fake,
    { command: process.execPath, args: [], bundled: true },
    process.cwd(),
    {},
    1000,
    ["--check"],
  );
  assert.equal(extractNativeCommand(process.execPath), process.execPath);
  assert.equal(extractNativeCommand("not-an-absolute-path"), undefined);
  assert.equal(resolved.command, process.execPath);
  assert.deepEqual(resolved.args, ["--check"]);
  assert.equal(resolved.bundled, true);
  assert.equal(specs.length, 1);
  assert.equal(specs[0].argv.at(-3), "node");
  assert.equal(specs[0].argv.at(-2), "-e");
  assert.match(specs[0].argv.at(-1), /codebase-memory-mcp/);
});

test("normalizes working directory and explicit CBM environment", () => {
  const cwd = resolveWorkingDirectory(".");
  assert.equal(cwd.startsWith("/"), true);
  assert.equal(resolveWorkingDirectory(undefined, "/workspace/example"), "/workspace/example");
  assert.equal(resolveWorkingDirectory("src", "/workspace/example"), "/workspace/example/src");
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

test("maps the supported RTK release matrix and isolates its runtime data", () => {
  const linux = rtkAssetFor("linux", "x64");
  assert.equal(linux?.name, "rtk-x86_64-unknown-linux-musl.tar.gz");
  assert.equal(rtkAssetFor("linux", "ppc64"), undefined);
  assert.match(rtkAssetUrl(linux), new RegExp("v" + RTK_VERSION));
  const env = rtkEnvironment("/tmp/dsh/runtimes/rtk/v" + RTK_VERSION, { PATH: "/controlled/bin" });
  assert.equal(env.HOME, "/tmp/dsh");
  assert.equal(env.RTK_TELEMETRY_DISABLED, "1");
  assert.equal(env.RTK_TEE_DIR, "/tmp/dsh/runtimes/rtk/v" + RTK_VERSION + "/tee");
  assert.equal(env.RTK_CONFIG, undefined);
  assert.equal(env.PATH, "/controlled/bin");
  assert.equal(rtkDisabled("RTK_DISABLED=1 git status"), true);
  assert.equal(rtkDisabled("FOO=bar RTK_DISABLED=1 git status"), true);
  assert.equal(rtkDisabled("git status"), false);
  const filtered = rtkEnvironment("/tmp/dsh/runtimes/rtk/v" + RTK_VERSION, { RTK_CONFIG: "/tmp/host", HOME: "/tmp/host", XDG_CONFIG_HOME: "/tmp/host-config", KEEP: "yes" });
  assert.equal(filtered.KEEP, "yes");
  assert.equal(filtered.HOME, "/tmp/dsh");
  assert.equal(filtered.RTK_CONFIG, undefined);
  assert.equal(filtered.XDG_CONFIG_HOME, "/tmp/dsh/config");
});

test("binds a managed RTK executable without changing ambient PATH", () => {
  assert.equal(bindRtkExecutable("git status", "/tmp/rtk"), "git status");
  assert.equal(bindRtkExecutable("rtk git status", "/tmp/rtk"), "'/tmp/rtk' git status");
  assert.equal(bindRtkExecutable("rtk", "/tmp/a'b"), "'/tmp/a'\\''b'");
  assert.equal(bindRtkExecutable("rtk\tgit status", "/tmp/rtk"), "'/tmp/rtk'\tgit status");
  assert.deepEqual(bashInput({ command: "git status", workdir: "/repo" }), { command: "git status", cwd: "/repo" });
  assert.equal(bashInput({ pattern: "git" }), undefined);
});


function tarArchive(entries) {
  const chunks = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.body);
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, "utf8");
    header.write((body.length.toString(8).padStart(11, "0") + "\0"), 124, "ascii");
    header[156] = entry.type ?? 0;
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks));
}

function zipArchive(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const body = Buffer.from(entry.body);
    const method = entry.method ?? 8;
    const compressed = method === 0 ? body : deflateRawSync(body);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(Buffer.concat([local, name, compressed]));

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(Buffer.concat([central, name]));
    localOffset += locals.at(-1).length;
  }
  const centralData = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralData.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...locals, centralData, end]);
}

function rewriteContext(exitCode, stdout, spawnError = false) {
  const calls = [];
  return {
    calls,
    subprocess: {
      spawn(spec) {
        calls.push(spec);
        if (spawnError) throw new Error("spawn failed");
        const reader = { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) };
        return {
          collected: { stdout: reader, stderr: { readFrom: () => ({ text: "", nextOffset: 0, lossy: false }) } },
          done: Promise.resolve({ exitCode, signal: null }),
          terminate() {},
        };
      },
    },
  };
}

test("accepts RTK rewrite exits 0 and 3, but never changes DSH policy", async () => {
  for (const exitCode of [0, 3]) {
    const fake = rewriteContext(exitCode, "rtk git status\n");
    const result = await rewriteRtk(fake, "/tmp/rtk", "git status", "/repo", {});
    assert.deepEqual(result, { command: "'/tmp/rtk' git status", exitCode });
    assert.deepEqual(fake.calls[0].argv, ["/tmp/rtk", "rewrite", "git status"]);
  }
});

test("extracts only exact RTK archive members and bounds tar/zip expansion", () => {
  const tarAsset = rtkAssetFor("linux", "x64");
  const zipAsset = rtkAssetFor("win32", "x64");
  assert.ok(tarAsset);
  assert.ok(zipAsset);
  const binary = Buffer.from("rtk-binary");
  assert.deepEqual(extractRtkBinary(tarArchive([{ name: "rtk", body: binary }]), tarAsset), binary);
  assert.deepEqual(extractRtkBinary(zipArchive([{ name: "rtk.exe", body: binary, method: 0 }]), zipAsset), binary);
  assert.throws(() => extractRtkBinary(tarArchive([{ name: "nested/rtk", body: binary }]), tarAsset), /does not contain/);
  assert.throws(() => extractRtkBinary(tarArchive([
    { name: "rtk", body: binary },
    { name: "rtk", body: binary },
  ]), tarAsset), /duplicate/);
  assert.throws(() => extractRtkBinary(tarArchive([{ name: "rtk", body: Buffer.alloc(13 * 1024 * 1024, "x") }]), tarAsset), /(?:larger|size|limit)/i);
  assert.throws(() => extractRtkBinary(zipArchive([
    { name: "rtk.exe", body: Buffer.alloc(7 * 1024 * 1024, "x") },
    { name: "other", body: Buffer.alloc(7 * 1024 * 1024, "y") },
  ]), zipAsset), /expanded output/);
});

test("fails open for passthrough, malformed, and process-error RTK results", async () => {
  const disabled = rewriteContext(0, "rtk git status\n");
  assert.equal(await rewriteRtk(disabled, "/tmp/rtk", "RTK_DISABLED=1 git status", "/repo", {}), undefined);
  assert.equal(disabled.calls.length, 0);
  const manual = rewriteContext(0, "rtk git status\n");
  assert.equal(await rewriteRtk(manual, "/tmp/rtk", "rtk git status", "/repo", {}), undefined);
  assert.equal(manual.calls.length, 0);
  const multiline = rewriteContext(0, "rtk git status\nwarning");
  assert.equal(await rewriteRtk(multiline, "/tmp/rtk", "git status", "/repo", {}), undefined);
  for (const exitCode of [1, 2]) {
    assert.equal(await rewriteRtk(rewriteContext(exitCode, ""), "/tmp/rtk", "git status", "/repo", {}), undefined);
  }
  assert.equal(await rewriteRtk(rewriteContext(0, ""), "/tmp/rtk", "git status", "/repo", {}), undefined);
  assert.equal(await rewriteRtk(rewriteContext(1, "", true), "/tmp/rtk", "git status", "/repo", {}), undefined);
  assert.equal(await rewriteRtk(rewriteContext(0, "rtk git status"), "/tmp/rtk", "rtk git status", "/repo", {}), undefined);
});
