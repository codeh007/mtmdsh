import type { Context } from "@deepseek-ai/cordis";
import { applyFileSkills, ensureSkillPackage } from "../../skill-files.js";
import packageCatalog from "./packages.json" with { type: "json" };

export type MtmCodingPackageKind = "data-only" | "runtime-backed";

export interface MtmCodingSkillFile {
  readonly name: string;
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
  readonly codebaseMemory: MtmCodingPackageManifest;
  readonly modernGo: MtmCodingPackageManifest & { readonly skills: MtmCodingSkillSource };
  readonly ponytail: MtmCodingPackageManifest & { readonly skills: MtmCodingSkillSource };
  readonly rtk: MtmCodingPackageManifest;
}

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const PATH_PART = /^[A-Za-z0-9._-]+$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
  for (const file of value.files) {
    if (!isRecord(file) || typeof file.name !== "string" || typeof file.path !== "string" || typeof file.sha256 !== "string") {
      throw new Error("mtm-coding: invalid skill file metadata for " + label);
    }
    const pathParts = file.path.split("/");
    if (!ID.test(file.name) || names.has(file.name) || !SHA256.test(file.sha256) || pathParts.at(-1) !== "SKILL.md" || pathParts.some((part) => !PATH_PART.test(part) || part === "." || part === "..")) {
      throw new Error("mtm-coding: invalid skill file metadata for " + label);
    }
    names.add(file.name);
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
  if (!isRecord(value)) throw new Error("mtm-coding: package catalog is invalid");
  for (const key of ["codebaseMemory", "modernGo", "ponytail", "rtk"]) assertManifest(value[key], key);
  const catalog = value as unknown as MtmCodingPackageCatalog;
  if (catalog.modernGo.skills === undefined || catalog.ponytail.skills === undefined) throw new Error("mtm-coding: package catalog skill metadata is incomplete");
}

assertCatalog(packageCatalog);

/** Trusted release metadata; mutable enabled state remains in mtm-coding settings. */
export const MTM_CODING_PACKAGES: MtmCodingPackageCatalog = packageCatalog;

/** Install and mount one package's external skills, then its static prompt. */
export async function applyManifestPackage(ctx: Context, packageManifest: MtmCodingPackageManifest): Promise<boolean> {
  if (packageManifest.skills !== undefined) {
    try {
      const root = await ensureSkillPackage(packageManifest as MtmCodingPackageManifest & { readonly skills: MtmCodingSkillSource });
      applyFileSkills(ctx, "mtm-coding-" + packageManifest.id, root);
    } catch (error) {
      ctx.logger.warn("mtm-coding: " + packageManifest.label + " skills are unavailable: " + String(error));
      return false;
    }
  }
  if (packageManifest.prompt !== undefined) {
    ctx.systemPrompt.section({
      name: "mtm-coding:" + packageManifest.id + ":prompt",
      order: packageManifest.prompt.order,
      text: packageManifest.prompt.text,
    });
  }
  return true;
}
