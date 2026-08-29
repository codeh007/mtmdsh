import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import * as SkillFilesystem from "@deepseek-ai/dsh-skill-filesystem";
import type { MtmCodingPackageManifest, MtmCodingSkillSource } from "./features/coding/manifest.js";

const MAX_SKILL_BYTES = 1_048_576;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
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
  if (!REVISION.test(source.revision) || pathParts.at(-1) !== "SKILL.md" || pathParts.some((part) => part === "" || part === "." || part === ".." || !/^[A-Za-z0-9._-]+$/u.test(part))) {
    throw new Error("mtm-coding: invalid pinned skill source");
  }
  return [
    "https://raw.githubusercontent.com",
    ...repositoryParts.map(encodeURIComponent),
    source.revision,
    ...pathParts.map(encodeURIComponent),
  ].join("/");
}

async function responseBytes(response: Response, url: string): Promise<Buffer> {
  if (!response.ok) throw new Error("mtm-coding: skill download failed with HTTP " + response.status + ": " + url);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_SKILL_BYTES) throw new Error("mtm-coding: skill document exceeds the size limit");
  if (response.body === null) throw new Error("mtm-coding: skill download returned an empty body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
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

async function install(id: string, source: MtmCodingSkillSource, root: string, fetchImpl: FetchLike): Promise<string> {
  if (!SKILL_NAME.test(id)) throw new Error("mtm-coding: invalid package id " + id);
  if (await existingDirectory(root)) {
    // ponytail: installed roots are user-owned; add an explicit update/reset action before replacing edits.
    return root;
  }
  const parent = dirname(root);
  await mkdir(parent, { recursive: true });
  let temporary = await mkdtemp(join(parent, "." + id + "-"));
  try {
    const names = new Set<string>();
    if (source.files.length === 0) throw new Error("mtm-coding: skill package has no files");
    for (const file of source.files) {
      if (!SKILL_NAME.test(file.name) || names.has(file.name) || !SHA256.test(file.sha256) || file.path.split("/").at(-1) !== "SKILL.md") throw new Error("mtm-coding: invalid skill metadata for " + file.name);
      names.add(file.name);
      const url = remoteUrl(source, file.path);
      const response = await fetchImpl(url, { redirect: "error", signal: AbortSignal.timeout(20_000) });
      const body = await responseBytes(response, url);
      if (createHash("sha256").update(body).digest("hex") !== file.sha256) {
        throw new Error("mtm-coding: checksum mismatch for " + file.name);
      }
      const document = body.toString("utf8");
      const frontmatter = /^---\r?\nname:\s*([^\r\n]+)\r?\ndescription:\s*/u.exec(document);
      const documentName = frontmatter?.[1].replace(/^['"]|['"]$/gu, "").trim();
      if (documentName !== file.name) throw new Error("mtm-coding: skill document name mismatch for " + file.name);
      const directory = join(temporary, file.name);
      await mkdir(directory);
      await writeFile(join(directory, "SKILL.md"), body, { flag: "wx" });
    }
    await writeFile(join(temporary, ".mtmharness.json"), JSON.stringify({ packageId: id, status: "installed", source }, null, 2) + "\n", { flag: "wx" });
    try {
      await rename(temporary, root);
      temporary = "";
    } catch (error) {
      if (errno(error) !== "EEXIST" && errno(error) !== "ENOTEMPTY") throw error;
      if (!await existingDirectory(root)) throw error;
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
  options: { readonly root?: string; readonly fetch?: FetchLike } = {},
): Promise<string> {
  const root = options.root ?? skillPackageRoot(packageManifest.id);
  let pending = installing.get(root);
  if (pending === undefined) {
    pending = install(packageManifest.id, packageManifest.skills, root, options.fetch ?? fetch);
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
