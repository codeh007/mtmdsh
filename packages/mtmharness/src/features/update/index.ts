import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import { runCollected } from "../coding/runtime.js";
import { MTM_UPDATE_CHANNEL, parseMtmUpdateRpcRequest, type MtmUpdateResponse } from "./contract.js";

const PACKAGE_NAME = "mtmharness";
const UPDATE_TIMEOUT_MS = 300_000;
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

type RpcResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: "internal"; readonly message: string; readonly details: Record<string, never> } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableVersion(value: unknown): string | undefined {
  return typeof value === "string" && VERSION_PATTERN.test(value) ? value : undefined;
}

function versionParts(version: string): [number, number, number] {
  const parts = version.split(".").map(Number);
  return [parts[0]!, parts[1]!, parts[2]!];
}

function compareVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index]! !== b[index]!) return a[index]! - b[index]!;
  }
  return 0;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function failure(error: unknown): RpcResult<never> {
  return {
    ok: false,
    error: {
      code: "internal",
      message: errorMessage(error, "mtm-update request failed"),
      details: {},
    },
  };
}

function profileDirFromContext(ctx: Context): string {
  if (ctx.baseUrl === undefined) throw new Error("mtm-update: active DSH profile is unavailable");
  let url: URL;
  try {
    url = new URL(ctx.baseUrl);
  } catch {
    throw new Error("mtm-update: active DSH profile URL is invalid");
  }
  if (url.protocol !== "file:") throw new Error("mtm-update: active DSH profile is not file-backed");
  return fileURLToPath(url);
}

async function readProfileManifest(profileDir: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(join(profileDir, "package.json"), "utf8");
  } catch {
    throw new Error("mtm-update: active DSH profile manifest is unavailable");
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error("mtm-update: active DSH profile manifest is invalid");
  }
  if (!isRecord(manifest)) throw new Error("mtm-update: active DSH profile manifest is invalid");
  const dsh = isRecord(manifest.dsh) ? manifest.dsh : undefined;
  const profile = dsh !== undefined && isRecord(dsh.profile) ? dsh.profile : undefined;
  const dependencies = manifest.dependencies;
  if (profile === undefined || !Array.isArray(profile.bundles) || !profile.bundles.includes(PACKAGE_NAME)
    || !isRecord(dependencies) || !Object.hasOwn(dependencies, PACKAGE_NAME)) {
    throw new Error("mtm-update: mtmharness is not an active DSH profile dependency");
  }
}

async function readInstalledVersion(profileDir: string): Promise<string> {
  await readProfileManifest(profileDir);
  let raw: string;
  try {
    raw = await readFile(join(profileDir, "node_modules", PACKAGE_NAME, "package.json"), "utf8");
  } catch {
    throw new Error("mtm-update: mtmharness is not installed in the active profile");
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error("mtm-update: installed mtmharness manifest is invalid");
  }
  const version = isRecord(manifest) && manifest.name === PACKAGE_NAME ? stableVersion(manifest.version) : undefined;
  if (version === undefined) throw new Error("mtm-update: installed mtmharness manifest is invalid");
  return version;
}

async function runPnpm(ctx: Context, profileDir: string, args: readonly string[], signal: AbortSignal) {
  let executable: string;
  try {
    executable = await ctx.subprocess.resolveExecutable("pnpm", undefined, signal);
  } catch {
    if (signal.aborted) throw new Error("mtm-update: operation cancelled");
    throw new Error("mtm-update: pnpm is unavailable");
  }
  try {
    return await runCollected(ctx, [executable, ...args], profileDir, {}, "", UPDATE_TIMEOUT_MS, signal);
  } catch {
    if (signal.aborted) throw new Error("mtm-update: operation cancelled");
    throw new Error("mtm-update: package manager could not start");
  }
}

function parseLatestVersion(output: string): string {
  let value: unknown = output.trim();
  try {
    value = JSON.parse(output.trim());
  } catch {
    // pnpm without JSON quoting still emits one plain version line.
  }
  if (Array.isArray(value) && value.length === 1) value = value[0];
  const version = stableVersion(value);
  if (version === undefined) throw new Error("mtm-update: npm registry returned an invalid stable version");
  return version;
}

async function readLatestVersion(ctx: Context, profileDir: string, signal: AbortSignal): Promise<string> {
  const result = await runPnpm(ctx, profileDir, ["view", PACKAGE_NAME + "@latest", "version", "--json"], signal);
  if (signal.aborted) throw new Error("mtm-update: operation cancelled");
  if (result.timedOut) throw new Error("mtm-update: npm registry check timed out");
  if (result.outcome.exitCode !== 0 || result.outcome.signal !== null) throw new Error("mtm-update: npm registry check failed");
  return parseLatestVersion(result.stdout);
}

function unavailable(currentVersion: string | null, latestVersion: string | null, error: unknown): MtmUpdateResponse {
  return { currentVersion, latestVersion, status: "unavailable", error: errorMessage(error, "mtm-update is unavailable"), restartRequired: false };
}

function failed(currentVersion: string | null, latestVersion: string | null, error: unknown, restartRequired: boolean): MtmUpdateResponse {
  return { currentVersion, latestVersion, status: "failed", error: errorMessage(error, "mtm-update failed"), restartRequired };
}

async function check(ctx: Context, signal: AbortSignal): Promise<MtmUpdateResponse> {
  let profileDir: string;
  let currentVersion: string;
  try {
    profileDir = profileDirFromContext(ctx);
    currentVersion = await readInstalledVersion(profileDir);
  } catch (error) {
    return unavailable(null, null, error);
  }
  try {
    const latestVersion = await readLatestVersion(ctx, profileDir, signal);
    const comparison = compareVersions(currentVersion, latestVersion);
    return {
      currentVersion,
      latestVersion,
      status: comparison === 0 ? "current" : comparison > 0 ? "ahead" : "available",
      error: null,
      restartRequired: false,
    };
  } catch (error) {
    return unavailable(currentVersion, null, error);
  }
}

async function update(ctx: Context, signal: AbortSignal, markRestartRequired: () => void): Promise<MtmUpdateResponse> {
  const checked = await check(ctx, signal);
  if (checked.status !== "available" || checked.latestVersion === null) return checked;
  let profileDir: string;
  try {
    profileDir = profileDirFromContext(ctx);
    const result = await runPnpm(ctx, profileDir, ["update", PACKAGE_NAME, "--latest"], signal);
    if (signal.aborted) return failed(checked.currentVersion, checked.latestVersion, new Error("mtm-update: operation cancelled"), false);
    if (result.timedOut || result.outcome.exitCode !== 0 || result.outcome.signal !== null) {
      return failed(checked.currentVersion, checked.latestVersion, new Error("mtm-update: package manager update failed"), false);
    }
    const installedVersion = await readInstalledVersion(profileDir);
    if (installedVersion !== checked.latestVersion) {
      return failed(installedVersion, checked.latestVersion, new Error("mtm-update: installed version did not match the registry"), false);
    }
    markRestartRequired();
    return { ...checked, currentVersion: installedVersion, status: "updated", error: null, restartRequired: true };
  } catch (error) {
    return failed(checked.currentVersion, checked.latestVersion, error, false);
  }
}

/** Install the Host-mediated mtmharness profile updater on DSH's loopback RPC. */
export const name = "mtm-update";
export const inject = ["connection", "subprocess"];

export type MtmUpdateRpcHandler = ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>>) & {
  dispose(): Promise<void>;
};

export function createMtmUpdateRpcHandler(ctx: Context): MtmUpdateRpcHandler {
  let restartRequired = false;
  let tail: Promise<void> = Promise.resolve();
  let disposed = false;
  const owner = new AbortController();
  const active = new Set<Promise<unknown>>();

  const enqueue = <T>(job: () => Promise<T>): Promise<T> => {
    const result = tail.then(job, job);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };

  const handler = Object.assign(
    async (endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>> => {
      if (owner.signal.aborted) return failure(new Error("mtm-update: operation cancelled"));
      if (endpoint !== "request") return failure(new Error("mtm-update: unknown RPC endpoint"));
      try {
        const request = parseMtmUpdateRpcRequest((payload as { args?: unknown } | null)?.args);
        const requestSignal = AbortSignal.any([owner.signal, signal]);
        const pending = enqueue(() => request.kind === "check"
          ? check(ctx, requestSignal)
          : update(ctx, requestSignal, () => { restartRequired = true; }));
        active.add(pending);
        try {
          const value = await pending;
          return { ok: true, value: { ...value, restartRequired: value.restartRequired || restartRequired } };
        } finally {
          active.delete(pending);
        }
      } catch (error) {
        return failure(error);
      }
    },
    {
      async dispose(): Promise<void> {
        if (!disposed) {
          disposed = true;
          owner.abort(new Error("mtm-update disposed"));
        }
        await Promise.allSettled([...active]);
      },
    },
  );
  return handler;
}

export function apply(ctx: Context): void {
  const handler = createMtmUpdateRpcHandler(ctx);
  ctx.effect(() => {
    const remove = ctx.connection.rpc.handle(MTM_UPDATE_CHANNEL, handler);
    return async () => {
      await handler.dispose();
      await remove();
    };
  }, "mtm-update: Host RPC");
}
