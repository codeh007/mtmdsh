import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import * as SkillFilesystem from "@deepseek-ai/dsh-skill-filesystem";

// Resolve the package asset path from the installed module, not the development checkout.
const SKILL_URL = new URL("../src/skills/", import.meta.url);
const SKILL_ROOT = SKILL_URL.protocol === "file:" ? fileURLToPath(SKILL_URL) : undefined;
const SKILL_DOCUMENT = /^---\r?\n[\s\S]*?\r?\n---\r?\n([\s\S]*)$/u;
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function skillDirectory(name: string): string {
  if (!SKILL_NAME.test(name)) throw new Error("mtm-coding: invalid skill name " + name);
  if (SKILL_ROOT === undefined) throw new Error("mtm-coding: file-backed skills require a Node host");
  return join(SKILL_ROOT, name);
}

export function skillFilePath(name: string): string {
  return join(skillDirectory(name), "SKILL.md");
}

export function readSkillContent(name: string): string {
  const path = skillFilePath(name);
  const document = readFileSync(path, "utf8");
  const match = SKILL_DOCUMENT.exec(document);
  if (match === null) throw new Error("mtm-coding: invalid skill document at " + path);
  return match[1].trim();
}

/** Mount one package root so its enabled feature owns one provider and watcher. */
export function applyFileSkills(ctx: Context, providerName: string, rootName: string): void {
  SkillFilesystem.apply(ctx, {
    providerName,
    includeDefaultRoots: false,
    bundledSkillDir: skillDirectory(rootName),
  });
}
