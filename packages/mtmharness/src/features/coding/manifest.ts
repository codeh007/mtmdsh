import type { Context } from "@deepseek-ai/cordis";
import { applyFileSkills, ensureSkillPackage } from "../../skill-files.js";
import packageCatalog from "./config.json" with { type: "json" };

export type MtmCodingPackageKind = "data-only" | "runtime-backed";

export interface MtmCodingSkillFile {
  /** Owning skill name; resource entries may repeat this name. */
  readonly name: string;
  /** Pinned repository path; the path below the owning skill is preserved locally. */
  readonly path: string;
  readonly sha256: string;
}

export interface MtmCodingSkillSource {
  readonly repository: string;
  readonly revision: string;
  readonly files: readonly MtmCodingSkillFile[];
}

export interface MtmCodingPackageManifest {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: "code" | "search" | "terminal";
  readonly kind: MtmCodingPackageKind;
  readonly skills?: MtmCodingSkillSource;
  readonly prompt?: {
    readonly order: number;
    readonly text: string;
  };
}

export interface MtmCodingPackageCatalog {
  readonly packages: readonly MtmCodingPackageManifest[];
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PATH_PART = /^[A-Za-z0-9._-]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function skillRelativeParts(name: string, path: string): string[] | undefined {
  const pathParts = path.split("/");
  if (!pathParts.every((part) => PATH_PART.test(part) && part !== "." && part !== "..")) return undefined;
  const skillIndex = pathParts.lastIndexOf(name);
  if (skillIndex < 0 || skillIndex === pathParts.length - 1) return undefined;
  const relative = pathParts.slice(skillIndex + 1);
  return relative.every((part) => PATH_PART.test(part) && part !== "." && part !== "..") ? relative : undefined;
}

function assertSkillSource(value: unknown, label: string): asserts value is MtmCodingSkillSource {
  if (!isRecord(value) || typeof value.repository !== "string" || typeof value.revision !== "string" || !Array.isArray(value.files)) {
    throw new Error("mtm-coding: invalid skill source metadata for " + label);
  }
  let repository: URL;
  try {
    repository = new URL(value.repository);
  } catch {
    throw new Error("mtm-coding: invalid skill repository for " + label);
  }
  const repositoryParts = repository.pathname.split("/").filter(Boolean);
  if (repository.protocol !== "https:" || repository.hostname !== "github.com" || repository.port !== "" || repository.username !== "" || repository.password !== "" || repository.search !== "" || repository.hash !== "" || repositoryParts.length !== 2 || repositoryParts.some((part) => !PATH_PART.test(part)) || !REVISION.test(value.revision) || value.files.length === 0) {
    throw new Error("mtm-coding: invalid pinned skill source for " + label);
  }
  const names = new Set<string>();
  const documents = new Set<string>();
  const localPaths = new Set<string>();
  for (const file of value.files) {
    if (!isRecord(file) || typeof file.name !== "string" || typeof file.path !== "string" || typeof file.sha256 !== "string") {
      throw new Error("mtm-coding: invalid skill file metadata for " + label);
    }
    const relative = skillRelativeParts(file.name, file.path);
    const localPath = relative === undefined ? undefined : file.name + "/" + relative.join("/");
    if (!ID.test(file.name) || !SHA256.test(file.sha256) || relative === undefined || localPath === undefined || localPaths.has(localPath)) {
      throw new Error("mtm-coding: invalid skill file metadata for " + label);
    }
    names.add(file.name);
    localPaths.add(localPath);
    if (relative.length === 1 && relative[0] === "SKILL.md") {
      if (documents.has(file.name)) throw new Error("mtm-coding: duplicate skill document metadata for " + label);
      documents.add(file.name);
    }
  }
  for (const name of names) {
    if (!documents.has(name)) throw new Error("mtm-coding: skill source has no SKILL.md for " + name);
  }
}

function assertManifest(value: unknown, label: string): asserts value is MtmCodingPackageManifest {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string" || typeof value.description !== "string" || !["code", "search", "terminal"].includes(value.icon as string) || !["data-only", "runtime-backed"].includes(value.kind as string) || !ID.test(value.id)) {
    throw new Error("mtm-coding: invalid package metadata for " + label);
  }
  if (value.skills !== undefined) assertSkillSource(value.skills, label);
  if (value.prompt !== undefined && (!isRecord(value.prompt) || typeof value.prompt.order !== "number" || !Number.isFinite(value.prompt.order) || typeof value.prompt.text !== "string")) {
    throw new Error("mtm-coding: invalid package prompt metadata for " + label);
  }
}

function assertCatalog(value: unknown): asserts value is MtmCodingPackageCatalog {
  if (!isRecord(value) || !Array.isArray(value.packages) || value.packages.length === 0) throw new Error("mtm-coding: package catalog is invalid");
  const ids = new Set<string>();
  for (const packageManifest of value.packages) {
    assertManifest(packageManifest, "package");
    if (ids.has(packageManifest.id)) throw new Error("mtm-coding: duplicate package id " + packageManifest.id);
    ids.add(packageManifest.id);
  }
}

assertCatalog(packageCatalog);

/** Trusted release metadata; mutable enabled state remains in mtm-coding settings. */
export const MTM_CODING_PACKAGES: MtmCodingPackageCatalog = packageCatalog;

export function codingPackage(id: string): MtmCodingPackageManifest {
  const packageManifest = MTM_CODING_PACKAGES.packages.find((item) => item.id === id);
  if (packageManifest === undefined) throw new Error("mtm-coding: package is not configured: " + id);
  return packageManifest;
}

/** Install every configured data-only package with one shared lifecycle. */
export async function applyDataOnlyPackages(ctx: Context): Promise<void> {
  for (const packageManifest of MTM_CODING_PACKAGES.packages) {
    if (packageManifest.kind !== "data-only") continue;
    try {
      await applyManifestPackage(ctx, packageManifest);
    } catch {
      // The package-specific warning is emitted by applyManifestPackage; other packages remain usable.
    }
  }
}

/** Install and mount one package's external skills, then its static prompt. */
export async function applyManifestPackage(ctx: Context, packageManifest: MtmCodingPackageManifest): Promise<void> {
  if (packageManifest.skills !== undefined) {
    const lifecycle = new AbortController();
    ctx.effect(() => () => { lifecycle.abort(new Error("mtm-coding skill package disposed")); }, "mtm-coding:" + packageManifest.id + ":skill-install");
    try {
      const root = await ensureSkillPackage(packageManifest as MtmCodingPackageManifest & { readonly skills: MtmCodingSkillSource }, { signal: lifecycle.signal });
      if (lifecycle.signal.aborted) throw lifecycle.signal.reason ?? new Error("mtm-coding skill package disposed");
      applyFileSkills(ctx, "mtm-coding-" + packageManifest.id, root);
    } catch (error) {
      ctx.logger.warn("mtm-coding: " + packageManifest.label + " skills are unavailable: " + String(error));
      throw error;
    }
  }
  if (packageManifest.prompt !== undefined) {
    ctx.systemPrompt.section({
      name: "mtm-coding:" + packageManifest.id + ":prompt",
      order: packageManifest.prompt.order,
      text: packageManifest.prompt.text,
    });
  }
}
