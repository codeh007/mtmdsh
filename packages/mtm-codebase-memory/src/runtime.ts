import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import type {
  SubprocessCollect,
  SubprocessHandle,
  SubprocessOutcome,
} from "@deepseek-ai/dsh-subprocess";

const require = createRequire(import.meta.url);

export const CBM_PACKAGE_VERSION = "0.10.8";
const OUTPUT_LIMIT_BYTES = 16 * 1024;
const ERROR_LIMIT_BYTES = 4 * 1024;

export interface CommandSpec {
  readonly command: string;
  readonly args: readonly string[];
  readonly bundled: boolean;
}

export interface CollectedRun {
  readonly outcome: SubprocessOutcome;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export type ModuleResolver = (specifier: string) => string;

/** Resolve the package-owned npm CLI and execute it through the current Node binary. */
export function resolveBundledCommand(
  resolveModule: ModuleResolver = require.resolve.bind(require),
): CommandSpec {
  let packageJson: string;
  try {
    packageJson = resolveModule("npm/package.json");
  } catch (error) {
    throw new Error("mtm-codebase-memory: package-owned npm CLI is unavailable", { cause: error });
  }
  const npxCli = join(dirname(packageJson), "bin", "npx-cli.js");
  if (!existsSync(npxCli)) {
    throw new Error("mtm-codebase-memory: package-owned npx CLI is missing at " + npxCli);
  }
  return {
    command: process.execPath,
    args: [npxCli, "--yes", "--package", "codebase-memory-mcp@" + CBM_PACKAGE_VERSION, "codebase-memory-mcp"],
    bundled: true,
  };
}

/** Resolve a configured command, defaulting to the pinned lazy npm runtime. */
export function resolveCommand(
  command: string | undefined,
  args: readonly string[] = [],
): CommandSpec {
  if (command !== undefined && command.trim().length > 0) {
    return { command, args: [...args], bundled: false };
  }
  const bundled = resolveBundledCommand();
  return { ...bundled, args: [...bundled.args, ...args] };
}

/** Normalize an empty or relative working directory to one absolute path. */
export function resolveWorkingDirectory(cwd: string | undefined): string {
  return resolve(cwd?.trim() || process.cwd());
}

/** Build explicit CBM environment values while leaving DSH's ambient scrub intact. */
export function resolveEnvironment(
  env: Readonly<Record<string, string>> | undefined,
  cacheDir: string | undefined,
  allowedRoot: string | undefined,
): Record<string, string> {
  return {
    ...env,
    ...(cacheDir?.trim() ? { CBM_CACHE_DIR: resolve(cacheDir) } : {}),
    ...(allowedRoot?.trim() ? { CBM_ALLOWED_ROOT: resolve(allowedRoot) } : {}),
  };
}

function collectOutput(handle: SubprocessHandle, stream: "stdout" | "stderr"): string {
  return handle.collected[stream]?.readFrom(0).text ?? "";
}

function combinedSignal(parent: AbortSignal | undefined, timeout: AbortSignal): AbortSignal {
  return parent === undefined ? timeout : AbortSignal.any([parent, timeout]);
}

/** Run one bounded, non-shell child through the DSH subprocess seam. */
export async function runCollected(
  ctx: Context,
  argv: readonly string[],
  cwd: string,
  env: Readonly<Record<string, string>>,
  input: string,
  timeoutMs: number,
  parentSignal?: AbortSignal,
): Promise<CollectedRun> {
  const timeoutController = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(new Error("mtm-codebase-memory subprocess timed out"));
  }, timeoutMs);
  timer.unref?.();

  const collect: SubprocessCollect = { maxBytes: OUTPUT_LIMIT_BYTES };
  const collectError: SubprocessCollect = { maxBytes: ERROR_LIMIT_BYTES };
  let handle: SubprocessHandle | undefined;
  try {
    handle = ctx.subprocess.spawn({
      argv,
      cwd,
      env,
      stdio: {
        stdin: { data: input },
        stdout: collect,
        stderr: collectError,
      },
      graceMs: Math.min(1000, Math.max(100, timeoutMs)),
      signal: combinedSignal(parentSignal, timeoutController.signal),
    });
    const outcome = await handle.done;
    return {
      outcome,
      stdout: collectOutput(handle, "stdout"),
      stderr: collectOutput(handle, "stderr"),
      timedOut,
    };
  } finally {
    clearTimeout(timer);
    if (handle !== undefined && timedOut) handle.terminate();
  }
}

/** Trigger the npm wrapper's lazy download and verify that it is runnable. */
export async function ensureRuntime(
  ctx: Context,
  command: CommandSpec,
  cwd: string,
  env: Readonly<Record<string, string>>,
  timeoutMs: number,
): Promise<void> {
  const result = await runCollected(ctx, [command.command, ...command.args, "--version"], cwd, env, "", timeoutMs);
  if (result.timedOut || result.outcome.exitCode !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "no diagnostic output";
    throw new Error("mtm-codebase-memory: native runtime check failed: " + detail);
  }
}

function contextFromJson(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  const direct = record.additionalContext;
  if (typeof direct === "string" && direct.trim()) return direct;
  const systemMessage = record.systemMessage;
  if (typeof systemMessage === "string" && systemMessage.trim()) return systemMessage;
  const hookOutput = record.hookSpecificOutput;
  if (typeof hookOutput !== "object" || hookOutput === null) return undefined;
  const nested = (hookOutput as Record<string, unknown>).additionalContext;
  return typeof nested === "string" && nested.trim() ? nested : undefined;
}

/** Parse the fail-open JSON envelope emitted by CBM hook-augment. */
export function extractHookContext(output: string): string | undefined {
  if (output.trim().length === 0) return undefined;
  try {
    return contextFromJson(JSON.parse(output));
  } catch {
    return undefined;
  }
}

/** Execute one CBM hook-augment event and return only its context payload. */
export async function runHookAugment(
  ctx: Context,
  command: CommandSpec,
  cwd: string,
  env: Readonly<Record<string, string>>,
  payload: Readonly<Record<string, unknown>>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const result = await runCollected(
    ctx,
    [command.command, ...command.args, "hook-augment"],
    cwd,
    env,
    JSON.stringify(payload) + "\n",
    timeoutMs,
    signal,
  );
  if (result.timedOut || result.outcome.exitCode !== 0) return undefined;
  return extractHookContext(result.stdout);
}
