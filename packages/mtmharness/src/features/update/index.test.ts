import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertMtmUpdateResponse,
  MTM_UPDATE_CHANNEL,
  parseMtmUpdateRpcRequest,
  type MtmUpdateResponse,
} from "./contract.ts";
import { apply, createMtmUpdateRpcHandler } from "./index.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function profile(version = "0.5.5"): string {
  const root = mkdtempSync(join(tmpdir(), "mtm-update-test-"));
  roots.push(root);
  mkdirSync(join(root, "node_modules", "mtmharness"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ dsh: { profile: { bundles: ["mtmharness"] } }, dependencies: { mtmharness: version } }));
  writeFileSync(join(root, "node_modules", "mtmharness", "package.json"), JSON.stringify({ name: "mtmharness", version }));
  return root;
}

interface FakeOptions {
  readonly latestOutput?: string;
  readonly latestExitCode?: number;
  readonly updateExitCode?: number;
  readonly updateVersion?: string;
  readonly updateDelayMs?: number;
  readonly missingPnpm?: boolean;
  readonly onUpdateStart?: () => void;
}

function fakeContext(profileDir: string, options: FakeOptions = {}) {
  const calls: Array<{ readonly argv: readonly string[]; readonly cwd: string }> = [];
  let active = 0;
  let maxActive = 0;
  let updateCount = 0;
  const subprocess = {
    async resolveExecutable(command: string, _env?: unknown, signal?: AbortSignal) {
      expect(command).toBe("pnpm");
      if (signal?.aborted) throw new Error("cancelled");
      if (options.missingPnpm) throw new Error("missing pnpm");
      return "/usr/bin/pnpm";
    },
    spawn(spec: { readonly argv: readonly string[]; readonly cwd: string }) {
      calls.push(spec);
      active += 1;
      maxActive = Math.max(maxActive, active);
      const isView = spec.argv.includes("view");
      if (!isView) {
        updateCount += 1;
        options.onUpdateStart?.();
      }
      const output = isView ? options.latestOutput ?? "\"0.6.0\"\n" : "";
      const exitCode = isView ? options.latestExitCode ?? 0 : options.updateExitCode ?? 0;
      const delay = isView ? 0 : options.updateDelayMs ?? 0;
      const done = new Promise<{ readonly exitCode: number; readonly signal: null }>((resolve) => {
        setTimeout(() => {
          if (!isView && options.updateVersion !== undefined) {
            writeFileSync(join(profileDir, "node_modules", "mtmharness", "package.json"), JSON.stringify({ name: "mtmharness", version: options.updateVersion }));
          }
          active -= 1;
          resolve({ exitCode, signal: null });
        }, delay);
      });
      const reader = { readFrom: () => ({ text: output, nextOffset: output.length, lossy: false }) };
      return {
        collected: { stdout: reader, stderr: { readFrom: () => ({ text: "", nextOffset: 0, lossy: false }) } },
        done,
        terminate() {},
      };
    },
  };
  return {
    ctx: { baseUrl: pathToFileURL(profileDir).href, subprocess },
    calls,
    stats: () => ({ maxActive, updateCount }),
  };
}

function responseValue(result: unknown): MtmUpdateResponse {
  const rpc = result as { readonly ok: boolean; readonly value?: unknown };
  expect(rpc.ok).toBe(true);
  return rpc.value as MtmUpdateResponse;
}

describe("mtm-update contract", () => {
  it("accepts only parameterless operations and validates stable responses", () => {
    expect(parseMtmUpdateRpcRequest({ kind: "check" })).toEqual({ kind: "check" });
    expect(parseMtmUpdateRpcRequest({ kind: "update" })).toEqual({ kind: "update" });
    expect(() => parseMtmUpdateRpcRequest({ kind: "check", package: "evil" })).toThrow("unsupported field");
    expect(() => parseMtmUpdateRpcRequest({ kind: "update", version: "1.0.0" })).toThrow("unsupported field");
    expect(() => assertMtmUpdateResponse({
      currentVersion: "1.0.0-beta.1",
      latestVersion: null,
      status: "available",
      error: null,
      restartRequired: false,
    })).toThrow("stable semantic version");
    expect(() => assertMtmUpdateResponse({
      currentVersion: "1.0.0",
      latestVersion: "1.1.0",
      status: "available",
      error: null,
      restartRequired: false,
      command: "rm -rf /",
    })).toThrow("unsupported field");
  });
});

describe("mtm-update Host", () => {
  it("registers the update channel and removes it on cleanup", async () => {
    const profileDir = profile();
    let registration: { channel: string } | undefined;
    let removed = false;
    const cleanups: Array<() => void | Promise<void>> = [];
    const fake = fakeContext(profileDir);
    const ctx = {
      ...fake.ctx,
      connection: {
        rpc: {
          handle(channel: string, _handler: unknown) {
            registration = { channel };
            return async () => { removed = true; };
          },
        },
      },
      effect(effect: () => (() => void | Promise<void>) | void) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup);
        return cleanup;
      },
    };
    apply(ctx as never);
    expect(registration).toEqual({ channel: MTM_UPDATE_CHANNEL });
    for (const cleanup of cleanups.reverse()) await cleanup();
    expect(removed).toBe(true);
  });

  it("checks and updates the active profile with fixed package-manager arguments", async () => {
    const profileDir = profile();
    const fake = fakeContext(profileDir, { updateVersion: "0.6.0" });
    const handler = createMtmUpdateRpcHandler(fake.ctx as never);
    const signal = new AbortController().signal;

    const checked = responseValue(await handler("request", { args: { kind: "check" } }, signal));
    expect(checked).toEqual({ currentVersion: "0.5.5", latestVersion: "0.6.0", status: "available", error: null, restartRequired: false });

    const updated = responseValue(await handler("request", { args: { kind: "update" } }, signal));
    expect(updated).toEqual({ currentVersion: "0.6.0", latestVersion: "0.6.0", status: "updated", error: null, restartRequired: true });
    expect(fake.calls.map((call) => call.argv)).toEqual([
      ["/usr/bin/pnpm", "view", "mtmharness@latest", "version", "--json"],
      ["/usr/bin/pnpm", "view", "mtmharness@latest", "version", "--json"],
      ["/usr/bin/pnpm", "update", "mtmharness", "--latest"],
    ]);
    expect(fake.calls.every((call) => call.cwd === profileDir)).toBe(true);
  });

  it("reports unavailable and failed states without asking the process to exit", async () => {
    const missingPnpm = fakeContext(profile(), { missingPnpm: true });
    const missingResult = responseValue(await createMtmUpdateRpcHandler(missingPnpm.ctx as never)("request", { args: { kind: "check" } }, new AbortController().signal));
    expect(missingResult).toMatchObject({ status: "unavailable", error: "mtm-update: pnpm is unavailable", restartRequired: false });

    const registryFailure = fakeContext(profile(), { latestExitCode: 1 });
    const registryResult = responseValue(await createMtmUpdateRpcHandler(registryFailure.ctx as never)("request", { args: { kind: "check" } }, new AbortController().signal));
    expect(registryResult).toMatchObject({ status: "unavailable", currentVersion: "0.5.5", error: "mtm-update: npm registry check failed" });

    const cancelled = fakeContext(profile());
    const cancelledResult = responseValue(await createMtmUpdateRpcHandler(cancelled.ctx as never)("request", { args: { kind: "check" } }, AbortSignal.abort()));
    expect(cancelledResult).toMatchObject({ status: "unavailable", error: "mtm-update: operation cancelled" });

    const failedUpdate = fakeContext(profile(), { updateExitCode: 1 });
    const failedResult = responseValue(await createMtmUpdateRpcHandler(failedUpdate.ctx as never)("request", { args: { kind: "update" } }, new AbortController().signal));
    expect(failedResult).toMatchObject({ status: "failed", currentVersion: "0.5.5", latestVersion: "0.6.0", restartRequired: false });
  });

  it("drains and cancels requests when the RPC owner is disposed", async () => {
    const profileDir = profile();
    let resolveUpdateStarted!: () => void;
    const updateStarted = new Promise<void>((resolve) => { resolveUpdateStarted = resolve; });
    const state = fakeContext(profileDir, { updateDelayMs: 20, onUpdateStart: resolveUpdateStarted });
    const handler = createMtmUpdateRpcHandler(state.ctx as never);
    const pending = handler("request", { args: { kind: "update" } }, new AbortController().signal);
    await updateStarted;
    expect(state.stats().updateCount).toBe(1);
    await handler.dispose();
    expect(responseValue(await pending)).toMatchObject({ status: "failed", error: "mtm-update: operation cancelled" });
    expect(state.stats().updateCount).toBe(1);
  });

  it("rejects malformed installed manifests and serializes concurrent updates", async () => {
    const malformedDir = profile();
    writeFileSync(join(malformedDir, "node_modules", "mtmharness", "package.json"), "not json");
    const malformed = fakeContext(malformedDir);
    const malformedResult = responseValue(await createMtmUpdateRpcHandler(malformed.ctx as never)("request", { args: { kind: "check" } }, new AbortController().signal));
    expect(malformedResult).toMatchObject({ status: "unavailable", error: "mtm-update: installed mtmharness manifest is invalid" });

    const concurrentDir = profile();
    const concurrent = fakeContext(concurrentDir, { updateVersion: "0.6.0", updateDelayMs: 10 });
    const handler = createMtmUpdateRpcHandler(concurrent.ctx as never);
    const request = { args: { kind: "update" } };
    const [first, second] = await Promise.all([
      handler("request", request, new AbortController().signal),
      handler("request", request, new AbortController().signal),
    ]);
    expect(responseValue(first).status).toBe("updated");
    expect(responseValue(second)).toMatchObject({ status: "current", currentVersion: "0.6.0", restartRequired: true });
    expect(concurrent.stats()).toEqual({ maxActive: 1, updateCount: 1 });
  });
});
