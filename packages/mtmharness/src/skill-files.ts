import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import * as SkillFilesystem from "@deepseek-ai/dsh-skill-filesystem";
import { parse as parseYaml } from "yaml";
import type { MtmCodingPackageManifest, MtmCodingSkillFile, MtmCodingSkillSource } from "./features/coding/manifest.js";

const MAX_SKILL_BYTES = 1_048_576;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PATH_PART = /^[A-Za-z0-9._-]+$/u;
const installing = new Map<string, Promise<string>>();

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function errno(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}

async function existingDirectory(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("mtm-coding: skill root is not a regular directory: " + path);
    return true;
  } catch (error) {
    if (errno(error) === "ENOENT") return false;
    throw error;
  }
}

function remoteUrl(source: MtmCodingSkillSource, path: string): string {
  const repository = new URL(source.repository);
  const repositoryParts = repository.pathname.split("/").filter(Boolean);
  const pathParts = path.split("/");
  if (repository.protocol !== "https:" || repository.hostname !== "github.com" || repository.port !== "" || repository.username !== "" || repository.password !== "" || repository.search !== "" || repository.hash !== "" || repositoryParts.length !== 2 || repositoryParts.some((part) => !/^[A-Za-z0-9._-]+$/u.test(part))) {
    throw new Error("mtm-coding: skill repository must be a GitHub HTTPS repository");
  }
  if (!REVISION.test(source.revision) || pathParts.some((part) => part === "" || part === "." || part === ".." || !PATH_PART.test(part))) {
    throw new Error("mtm-coding: invalid pinned skill source");
  }
  return [
    "https://raw.githubusercontent.com",
    ...repositoryParts.map(encodeURIComponent),
    source.revision,
    ...pathParts.map(encodeURIComponent),
  ].join("/");
}

interface ValidatedSkillFile {
  readonly file: MtmCodingSkillFile;
  readonly relative: readonly string[];
  readonly document: boolean;
}

function validateSkillFiles(source: MtmCodingSkillSource): ValidatedSkillFile[] {
  if (source.files.length === 0) throw new Error("mtm-coding: skill package has no files");
  const names = new Set<string>();
  const documents = new Set<string>();
  const localPaths = new Set<string>();
  const files: ValidatedSkillFile[] = [];
  for (const file of source.files) {
    if (file === null || typeof file !== "object" || typeof file.name !== "string" || typeof file.path !== "string" || typeof file.sha256 !== "string") {
      throw new Error("mtm-coding: invalid skill metadata");
    }
    const pathParts = file.path.split("/");
    const skillIndex = pathParts.lastIndexOf(file.name);
    const relative = skillIndex < 0 ? [] : pathParts.slice(skillIndex + 1);
    const document = relative.length === 1 && relative[0] === "SKILL.md";
    const localPath = file.name + "/" + relative.join("/");
    if (!SKILL_NAME.test(file.name) || !SHA256.test(file.sha256) || skillIndex < 0 || relative.length === 0 || relative.some((part) => !PATH_PART.test(part) || part === "." || part === "..") || localPaths.has(localPath)) {
      throw new Error("mtm-coding: invalid skill metadata for " + file.name);
    }
    if (document && documents.has(file.name)) throw new Error("mtm-coding: duplicate skill document metadata for " + file.name);
    names.add(file.name);
    localPaths.add(localPath);
    if (document) documents.add(file.name);
    files.push({ file, relative, document });
  }
  for (const name of names) {
    if (!documents.has(name)) throw new Error("mtm-coding: skill source has no SKILL.md for " + name);
  }
  return files;
}

async function existingFile(path: string): Promise<boolean> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error("mtm-coding: skill resource is not a regular file: " + path);
    return true;
  } catch (error) {
    if (errno(error) === "ENOENT") return false;
    throw error;
  }
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    const entry = await lstat(path);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error("mtm-coding: skill resource parent is not a regular directory: " + path);
  } catch (error) {
    if (errno(error) !== "ENOENT") throw error;
    await mkdir(path);
  }
}

async function ensureTargetDirectory(root: string, file: ValidatedSkillFile): Promise<string> {
  let directory = join(root, file.file.name);
  await ensureDirectory(directory);
  for (const part of file.relative.slice(0, -1)) {
    directory = join(directory, part);
    await ensureDirectory(directory);
  }
  return join(directory, file.relative.at(-1)!);
}

async function downloadFile(source: MtmCodingSkillSource, file: MtmCodingSkillFile, fetchImpl: FetchLike, signal?: AbortSignal): Promise<Buffer> {
  assertNotAborted(signal);
  const url = remoteUrl(source, file.path);
  const response = await fetchImpl(url, { redirect: "error", signal: requestSignal(signal) });
  const body = await responseBytes(response, url, signal);
  if (createHash("sha256").update(body).digest("hex") !== file.sha256) {
    throw new Error("mtm-coding: checksum mismatch for " + file.path);
  }
  return body;
}

function validateSkillDocument(file: ValidatedSkillFile, body: Buffer): void {
  if (!file.document) return;
  const documentName = parseSkillDocumentName(body.toString("utf8"));
  if (documentName !== file.file.name) throw new Error("mtm-coding: skill document name mismatch for " + file.file.name);
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error("mtm-coding: skill installation cancelled");
}

function requestSignal(signal: AbortSignal | undefined): AbortSignal {
  const timeout = AbortSignal.timeout(20_000);
  return signal === undefined ? timeout : AbortSignal.any([signal, timeout]);
}

async function responseBytes(response: Response, url: string, signal?: AbortSignal): Promise<Buffer> {
  assertNotAborted(signal);
  if (!response.ok) throw new Error("mtm-coding: skill download failed with HTTP " + response.status + ": " + url);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SKILL_BYTES) throw new Error("mtm-coding: skill document exceeds the size limit");
  if (response.body === null) throw new Error("mtm-coding: skill download returned an empty body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    assertNotAborted(signal);
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > MAX_SKILL_BYTES) {
      await reader.cancel();
      throw new Error("mtm-coding: skill document exceeds the size limit");
    }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks, total);
}

function parseSkillDocumentName(document: string): string | undefined {
  const firstLineEnd = document.indexOf("\n");
  if (firstLineEnd < 0 || document.slice(0, firstLineEnd).replace(/\r$/u, "") !== "---") return undefined;
  let lineStart = firstLineEnd + 1;
  while (lineStart <= document.length) {
    const nextNewline = document.indexOf("\n", lineStart);
    const lineEnd = nextNewline < 0 ? document.length : nextNewline;
    const line = document.slice(lineStart, lineEnd).replace(/\r$/u, "");
    if (line === "---") {
      const parsed = parseYaml(document.slice(firstLineEnd + 1, lineStart)) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
      const data = parsed as Record<string, unknown>;
      const name = data.name;
      const description = data.description;
      return typeof name === "string" && name.length > 0
        && typeof description === "string" && description.length > 0
        ? name
        : undefined;
    }
    if (nextNewline < 0) return undefined;
    lineStart = nextNewline + 1;
  }
  return undefined;
}

async function completeExistingPackage(root: string, files: readonly ValidatedSkillFile[], source: MtmCodingSkillSource, fetchImpl: FetchLike, signal?: AbortSignal): Promise<void> {
  for (const file of files) {
    assertNotAborted(signal);
    const target = await ensureTargetDirectory(root, file);
    if (await existingFile(target)) continue;
    const body = await downloadFile(source, file.file, fetchImpl, signal);
    validateSkillDocument(file, body);
    assertNotAborted(signal);
    try {
      await writeFile(target, body, { flag: "wx" });
    } catch (error) {
      if (errno(error) !== "EEXIST" || !await existingFile(target)) throw error;
    }
  }
}

async function install(id: string, source: MtmCodingSkillSource, root: string, fetchImpl: FetchLike, signal?: AbortSignal): Promise<string> {
  if (!SKILL_NAME.test(id)) throw new Error("mtm-coding: invalid package id " + id);
  const operationSignal = requestSignal(signal);
  assertNotAborted(operationSignal);
  const files = validateSkillFiles(source);
  if (await existingDirectory(root)) {
    // Installed roots are user-owned; add only missing pinned bundle files.
    await completeExistingPackage(root, files, source, fetchImpl, operationSignal);
    return root;
  }
  const parent = dirname(root);
  await mkdir(parent, { recursive: true });
  let temporary = await mkdtemp(join(parent, "." + id + "-"));
  try {
    for (const file of files) {
      assertNotAborted(operationSignal);
      const body = await downloadFile(source, file.file, fetchImpl, operationSignal);
      validateSkillDocument(file, body);
      assertNotAborted(operationSignal);
      const target = await ensureTargetDirectory(temporary, file);
      await writeFile(target, body, { flag: "wx" });
    }
    await writeFile(join(temporary, ".mtmharness.json"), JSON.stringify({ packageId: id, status: "installed", source }, null, 2) + "\n", { flag: "wx" });
    try {
      await rename(temporary, root);
      temporary = "";
    } catch (error) {
      if (errno(error) !== "EEXIST" && errno(error) !== "ENOTEMPTY") throw error;
      if (!await existingDirectory(root)) throw error;
      await completeExistingPackage(root, files, source, fetchImpl, operationSignal);
    }
    return root;
  } finally {
    if (temporary !== "") await rm(temporary, { recursive: true, force: true });
  }
}

export function skillPackageRoot(id: string, dshHome = resolveDshHome()): string {
  if (!SKILL_NAME.test(id)) throw new Error("mtm-coding: invalid package id " + id);
  return join(dshHome, "mtmharness", "skills", id);
}

export async function ensureSkillPackage(
  packageManifest: MtmCodingPackageManifest & { readonly skills: MtmCodingSkillSource },
  options: { readonly root?: string; readonly fetch?: FetchLike; readonly signal?: AbortSignal } = {},
): Promise<string> {
  const root = options.root ?? skillPackageRoot(packageManifest.id);
  let pending = installing.get(root);
  if (pending === undefined) {
    pending = install(packageManifest.id, packageManifest.skills, root, options.fetch ?? fetch, options.signal);
    installing.set(root, pending);
    pending.finally(() => { if (installing.get(root) === pending) installing.delete(root); }).catch(() => {});
  }
  return pending;
}

export function applyFileSkills(ctx: Context, providerName: string, root: string): void {
  SkillFilesystem.apply(ctx, {
    providerName,
    includeDefaultRoots: false,
    customSkillDirs: [root],
  });
}
