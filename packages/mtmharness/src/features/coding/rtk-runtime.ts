import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { gunzipSync, inflateRawSync } from "node:zlib";
import type { Context } from "@deepseek-ai/cordis";
import { runCollected, type CollectedRun } from "./runtime.js";

export const RTK_VERSION = "0.45.0";
export const RTK_REWRITE_TIMEOUT_MS = 2_000;
const MAX_ARCHIVE_BYTES = 12 * 1024 * 1024;
const RTK_HOME_ENV = "DSH_HOME";
const RELEASE_BASE = "https://github.com/rtk-ai/rtk/releases/download/v" + RTK_VERSION;

export interface RtkAsset {
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly name: string;
  readonly sha256: string;
  readonly archive: "tar.gz" | "zip";
  readonly binary: string;
}

const ASSETS: readonly RtkAsset[] = [
  { platform: "linux", arch: "x64", name: "rtk-x86_64-unknown-linux-musl.tar.gz", sha256: "c4c036fb181fc55ef329786c8c17e0d427972b053b825944d968a6aafef1ba4", archive: "tar.gz", binary: "rtk" },
  { platform: "linux", arch: "arm64", name: "rtk-aarch64-unknown-linux-gnu.tar.gz", sha256: "80a746dd305ef944ff50ef011ae4ce3878dd5ba88dfe35d859d05498191637c3", archive: "tar.gz", binary: "rtk" },
  { platform: "darwin", arch: "x64", name: "rtk-x86_64-apple-darwin.tar.gz", sha256: "9ea02f889d5a2779e4fb700df4587824303c5a57cda22e903e30058079fca0ef", archive: "tar.gz", binary: "rtk" },
  { platform: "darwin", arch: "arm64", name: "rtk-aarch64-apple-darwin.tar.gz", sha256: "064151cfc2d50b24d810b06a0af2e41b9c945e83534e4c438c3d3eae607fc3f4", archive: "tar.gz", binary: "rtk" },
  { platform: "win32", arch: "x64", name: "rtk-x86_64-pc-windows-msvc.zip", sha256: "34cea9009a8099acdaf85147b971d95f65efabfa63fb3aea7d3e2b73e6f517c3", archive: "zip", binary: "rtk.exe" },
];

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface RtkRuntimeOptions {
  readonly home?: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
  readonly fetch?: FetchLike;
}

export interface RtkRewriteResult {
  readonly command: string;
  readonly exitCode: number;
}

/** Return true when a command opts out of RTK for this invocation. */
export function rtkDisabled(command: string): boolean {
  return /^(?:[A-Za-z_][A-Za-z0-9_]*=[^\s]*\s+)*RTK_DISABLED=1(?:\s|$)/.test(command.trim());
}

const installing = new Map<string, Promise<string>>();
const INSTALL_LOCK_STALE_MS = 60_000;
const INSTALL_LOCK_WAIT_MS = 120_000;
const INSTALL_LOCK_HEARTBEAT_MS = 10_000;

function lockOwnerPid(owner: string): number | undefined {
  const pid = Number.parseInt(owner.split(":", 1)[0] ?? "", 10);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function canReclaimInstallLock(lockPath: string): Promise<boolean> {
  try {
    if (Date.now() - (await stat(lockPath)).mtimeMs <= INSTALL_LOCK_STALE_MS) return false;
    let owner: string;
    try {
      owner = await readFile(join(lockPath, "owner"), "utf8");
    } catch {
      return true;
    }
    const pid = lockOwnerPid(owner);
    return pid === undefined || !processIsAlive(pid);
  } catch {
    return false;
  }
}

/** Return the pinned release asset for one supported host target. */
export function rtkAssetFor(platform = process.platform, arch = process.arch): RtkAsset | undefined {
  return ASSETS.find(asset => asset.platform === platform && asset.arch === arch);
}

/** Return the immutable pinned release URL for an asset. */
export function rtkAssetUrl(asset: RtkAsset): string {
  return RELEASE_BASE + "/" + asset.name;
}

/** Resolve the one DSH-owned directory used for RTK state and binaries. */
export function resolveRtkHome(home = process.env[RTK_HOME_ENV]): string {
  return resolve(home?.trim() || join(homedir(), ".dsh"), "runtimes", "rtk", "v" + RTK_VERSION);
}

/** Build isolated RTK environment overrides while leaving the provider's ambient scrub intact. */
export function rtkEnvironment(home: string, env: Readonly<Record<string, string>> = {}): Record<string, string> {
  const dshHome = dirname(dirname(dirname(home)));
  const explicit: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    const normalized = key.toUpperCase();
    if (value !== undefined
      && !normalized.startsWith("RTK_")
      && normalized !== "HOME"
      && normalized !== "XDG_CONFIG_HOME"
      && normalized !== "XDG_DATA_HOME"
      && normalized !== "APPDATA"
      && normalized !== "LOCALAPPDATA") {
      explicit[key] = value;
    }
  }
  return {
    ...explicit,
    HOME: dshHome,
    XDG_CONFIG_HOME: join(dshHome, "config"),
    XDG_DATA_HOME: join(dshHome, "data"),
    APPDATA: join(dshHome, "config"),
    LOCALAPPDATA: join(dshHome, "data"),
    RTK_TELEMETRY_DISABLED: "1",
    RTK_TEE_DIR: join(home, "tee"),
  };
}

function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolveDelay, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      reject(signal?.reason);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolveDelay();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function awaitWithSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (signal === undefined) return promise;
  signal.throwIfAborted();
  return new Promise<T>((resolvePromise, reject) => {
    const onAbort = (): void => {
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) { onAbort(); return; }
    promise.then(
      value => { signal.removeEventListener("abort", onAbort); resolvePromise(value); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

async function prepareRtkEnvironment(home: string, env: Readonly<Record<string, string>>): Promise<Record<string, string>> {
  const dshHome = dirname(dirname(dirname(home)));
  const configDir = join(dshHome, "config", "rtk");
  await mkdir(configDir, { recursive: true });
  await mkdir(join(dshHome, "data"), { recursive: true });
  await mkdir(join(home, "tee"), { recursive: true });
  await writeFile(join(configDir, "config.toml"), [
    "[tracking]", "enabled = false", "database_path = " + JSON.stringify(join(home, "history.db")),
    "[tee]", "enabled = false", "mode = \"never\"",
    "[telemetry]", "enabled = false", "",
  ].join("\n"), { mode: 0o600 });
  return rtkEnvironment(home, env);
}

function validArchivePath(name: string): boolean {
  if (name.length === 0 || name.includes("\0") || name.startsWith("/") || name.includes("\\")) return false;
  const parts = name.split("/");
  return parts.every(part => part.length > 0 && part !== "." && part !== "..");
}

function parseOctal(bytes: Buffer): number {
  const value = bytes.toString("utf8").replace(/\0.*$/, "").trim();
  return value.length === 0 ? 0 : Number.parseInt(value, 8);
}

function targetFromTar(buffer: Buffer, asset: RtkAsset): Buffer {
  const data = gunzipSync(buffer, { maxOutputLength: MAX_ARCHIVE_BYTES });
  let offset = 0;
  let found: Buffer | undefined;
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    offset += 512;
    if (header.every(byte => byte === 0)) break;
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const fullName = prefix.length > 0 ? prefix + "/" + name : name;
    if (!validArchivePath(fullName)) throw new Error("RTK archive contains an unsafe path");
    const size = parseOctal(header.subarray(124, 136));
    if (!Number.isSafeInteger(size) || size < 0 || size > MAX_ARCHIVE_BYTES) throw new Error("RTK archive entry exceeds the size limit");
    const type = header[156];
    const body = data.subarray(offset, offset + size);
    if (body.length !== size) throw new Error("RTK archive entry is truncated");
    if (type === 0 || type === 48) {
      if (fullName === asset.binary) {
        if (found !== undefined) throw new Error("RTK archive contains duplicate " + asset.binary + " entries");
        found = Buffer.from(body);
      }
    } else if (type !== 53) {
      throw new Error("RTK archive contains a non-regular entry");
    }
    offset += Math.ceil(size / 512) * 512;
  }
  if (found === undefined) throw new Error("RTK archive does not contain " + asset.binary);
  return found;
}

function targetFromZip(buffer: Buffer, asset: RtkAsset): Buffer {
  const end = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= end; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error("RTK zip directory is missing");
  const count = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  if (directoryOffset + directorySize > buffer.length) throw new Error("RTK zip directory is truncated");
  let offset = directoryOffset;
  let found: Buffer | undefined;
  let expanded = 0;
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("RTK zip entry is malformed");
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameSize = buffer.readUInt16LE(offset + 28);
    const extraSize = buffer.readUInt16LE(offset + 30);
    const commentSize = buffer.readUInt16LE(offset + 32);
    const externalAttributes = buffer.readUInt32LE(offset + 38);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameSize).toString("utf8");
    if (!validArchivePath(name)) throw new Error("RTK zip contains an unsafe path");
    if ((externalAttributes >>> 16 & 0xf000) === 0xa000) throw new Error("RTK zip contains a symlink");
    if ((flags & 1) !== 0) throw new Error("RTK zip is encrypted");
    offset += 46 + nameSize + extraSize + commentSize;
    if (name.endsWith("/")) continue;
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("RTK zip local entry is malformed");
    const localNameSize = buffer.readUInt16LE(localOffset + 26);
    const localExtraSize = buffer.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameSize + localExtraSize;
    const compressed = buffer.subarray(start, start + compressedSize);
    if (compressed.length !== compressedSize) throw new Error("RTK zip entry is truncated");
    if (size > MAX_ARCHIVE_BYTES - expanded) throw new Error("RTK zip expanded output exceeds the size limit");
    const remaining = MAX_ARCHIVE_BYTES - expanded;
    const body = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed, { maxOutputLength: remaining }) : undefined;
    if (body === undefined || body.length !== size) throw new Error("RTK zip compression is unsupported");
    expanded += body.length;
    if (name === asset.binary) {
      if (found !== undefined) throw new Error("RTK zip contains duplicate " + asset.binary + " entries");
      found = body;
    }
  }
  if (found === undefined) throw new Error("RTK zip does not contain " + asset.binary);
  return found;
}

export function extractRtkBinary(buffer: Buffer, asset: RtkAsset): Buffer {
  if (buffer.length > MAX_ARCHIVE_BYTES) throw new Error("RTK archive exceeds the size limit");
  return asset.archive === "zip" ? targetFromZip(buffer, asset) : targetFromTar(buffer, asset);
}

async function readResponseBytes(response: Response, signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  const declared = response.headers.get("content-length");
  if (declared !== null && Number.parseInt(declared, 10) > MAX_ARCHIVE_BYTES) throw new Error("RTK download exceeds the size limit");
  if (response.body === null) {
    const bytes = Buffer.from(await response.arrayBuffer());
    signal?.throwIfAborted();
    if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error("RTK download exceeds the size limit");
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      signal?.throwIfAborted();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_ARCHIVE_BYTES) throw new Error("RTK download exceeds the size limit");
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

async function download(url: string, fetchImpl: FetchLike, parentSignal?: AbortSignal): Promise<Buffer> {
  const timeoutSignal = AbortSignal.timeout(30_000);
  const signal = parentSignal === undefined ? timeoutSignal : AbortSignal.any([parentSignal, timeoutSignal]);
  const response = await fetchImpl(url, { signal });
  if (!response.ok) throw new Error("RTK download failed: HTTP " + response.status);
  return readResponseBytes(response, signal);
}

function pinnedChecksum(checksums: string, asset: RtkAsset): boolean {
  return checksums.split(/\r?\n/).some(line => {
    const match = line.trim().match(/^([a-f0-9]{64})\s+[* ]?(.+)$/i);
    return match !== null && match[1]!.toLowerCase() === asset.sha256 && match[2]!.trim() === asset.name;
  });
}

function digest(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function probe(ctx: Context, command: string, cwd: string, env: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<boolean> {
  try {
    const result = await runCollected(ctx, [command, "--version"], cwd, env, "", 10_000, signal);
    signal?.throwIfAborted();
    return !result.timedOut && result.outcome.exitCode === 0 && new RegExp("\\b" + RTK_VERSION.replaceAll(".", "\\.") + "\\b").test(result.stdout);
  } catch {
    signal?.throwIfAborted();
    return false;
  }
}

async function install(ctx: Context, asset: RtkAsset, home: string, cwd: string, env: Readonly<Record<string, string>>, fetchImpl: FetchLike, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  const root = dirname(home);
  await mkdir(root, { recursive: true });
  const finalPath = join(home, asset.binary);
  if (await probe(ctx, finalPath, cwd, env, signal)) return finalPath;
  const lockPath = join(root, ".install-lock");
  const ownerPath = join(lockPath, "owner");
  let release: (() => Promise<void>) | undefined;
  for (let attempt = 0; attempt < INSTALL_LOCK_WAIT_MS / 100; attempt++) {
    let created = false;
    try {
      await mkdir(lockPath);
      created = true;
      const owner = process.pid + ":" + randomUUID();
      await writeFile(ownerPath, owner, { encoding: "utf8", mode: 0o600 });
      const heartbeat = setInterval(() => {
        const now = new Date();
        void utimes(lockPath, now, now).catch(() => {});
      }, INSTALL_LOCK_HEARTBEAT_MS);
      heartbeat.unref?.();
      release = async () => {
        clearInterval(heartbeat);
        try {
          if (await readFile(ownerPath, "utf8") !== owner) return;
        } catch {
          return;
        }
        await rm(lockPath, { recursive: true, force: true });
      };
      break;
    } catch {
      if (created) {
        await rm(lockPath, { recursive: true, force: true });
      } else if (await canReclaimInstallLock(lockPath)) {
        await rm(lockPath, { recursive: true, force: true });
      }
      await abortableDelay(100, signal);
      if (await probe(ctx, finalPath, cwd, env, signal)) return finalPath;
    }
  }
  if (release === undefined) throw new Error("RTK install lock timed out");
  let temporary: string | undefined;
  try {
    temporary = await mkdtemp(join(root, ".download-"));
    const archive = await download(rtkAssetUrl(asset), fetchImpl, signal);
    const checksums = (await download(RELEASE_BASE + "/checksums.txt", fetchImpl, signal)).toString("utf8");
    if (!pinnedChecksum(checksums, asset) || digest(archive) !== asset.sha256) throw new Error("RTK checksum verification failed");
    const binary = extractRtkBinary(archive, asset);
    const tempBinary = join(temporary, asset.binary);
    await writeFile(tempBinary, binary, { mode: 0o755 });
    if (asset.platform !== "win32") await chmod(tempBinary, 0o755);
    if (!await probe(ctx, tempBinary, cwd, env, signal)) throw new Error("RTK version probe failed after install");
    await mkdir(home, { recursive: true });
    await rename(tempBinary, finalPath);
    return finalPath;
  } finally {
    try {
      if (temporary !== undefined) await rm(temporary, { recursive: true, force: true });
    } finally {
      await release();
    }
  }
}

/** Resolve or lazily install the pinned RTK binary, failing open at callers. */
export async function ensureRtk(ctx: Context, options: RtkRuntimeOptions = {}): Promise<{ command: string; home: string; env: Record<string, string> }> {
  const home = resolveRtkHome(options.home);
  options.signal?.throwIfAborted();
  const cwd = resolve(options.cwd?.trim() || process.cwd());
  const env = await prepareRtkEnvironment(home, options.env ?? {});
  options.signal?.throwIfAborted();
  const asset = rtkAssetFor();
  if (asset === undefined) throw new Error("RTK is not available for " + process.platform + "/" + process.arch);
  const key = asset.name + "@" + home;
  let pending = installing.get(key);
  if (pending === undefined) {
    pending = install(ctx, asset, home, cwd, env, options.fetch ?? fetch, options.signal);
    installing.set(key, pending);
    pending.finally(() => { if (installing.get(key) === pending) installing.delete(key); }).catch(() => {});
  }
  return { command: await awaitWithSignal(pending, options.signal), home, env };
}

function shellQuote(value: string): string {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

/** Replace RTK's ambient executable name with its managed absolute path. */
export function bindRtkExecutable(command: string, binary: string): string {
  const trimmed = command.trim();
  if (trimmed === "rtk") return shellQuote(binary);
  if (/^rtk\s/.test(trimmed)) return shellQuote(binary) + trimmed.slice(3);
  return command;
}

/** Return whether one command is eligible for transparent RTK rewriting. */
export function shouldRewriteRtk(command: string): boolean {
  const trimmed = command.trim();
  return trimmed.length > 0 && !/^rtk(?:\s|$)/.test(trimmed) && !rtkDisabled(command);
}

/** Run the RTK rewrite command and return only a changed candidate. */
export async function rewriteRtk(
  ctx: Context,
  binary: string,
  command: string,
  cwd: string,
  env: Readonly<Record<string, string>>,
  signal?: AbortSignal,
): Promise<RtkRewriteResult | undefined> {
  const trimmed = command.trim();
  if (!shouldRewriteRtk(command)) return undefined;
  let result: CollectedRun;
  try {
    result = await runCollected(ctx, [binary, "rewrite", command], cwd, env, "", RTK_REWRITE_TIMEOUT_MS, signal);
  } catch {
    signal?.throwIfAborted();
    return undefined;
  }
  signal?.throwIfAborted();
  if (result.timedOut || (result.outcome.exitCode !== 0 && result.outcome.exitCode !== 3)) return undefined;
  const rewritten = result.stdout.trim();
  if (rewritten.length === 0 || /[\r\n]/.test(rewritten) || rewritten === trimmed) return undefined;
  return { command: bindRtkExecutable(rewritten, binary), exitCode: result.outcome.exitCode ?? -1 };
}

/** Extract a bash command and its workdir from a DSH bash tool input. */
export function bashInput(value: unknown): { command: string; cwd?: string } | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const record = value as Record<string, unknown>;
  return typeof record.command === "string" ? { command: record.command, cwd: typeof record.workdir === "string" ? record.workdir : undefined } : undefined;
}
