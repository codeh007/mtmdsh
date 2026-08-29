/* @vitest-environment node */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import { describe, expect, it } from "vitest";
import { applyFileSkills, ensureSkillPackage } from "../src/skill-files.ts";
import type { MtmCodingPackageManifest, MtmCodingSkillSource } from "../src/features/coding/manifest.ts";

const DOCUMENT = "---\nname: example-skill\ndescription: Test external skill.\n---\n\n# External\n\nOriginal body.\n";
const EDITED = DOCUMENT.replace("Original body.", "User edit.");
const source: MtmCodingSkillSource = {
  repository: "https://github.com/example/skills",
  revision: "a".repeat(40),
  files: [{
    name: "example-skill",
    path: "skills/example-skill/SKILL.md",
    sha256: createHash("sha256").update(DOCUMENT).digest("hex"),
  }],
};
const packageManifest: MtmCodingPackageManifest & { readonly skills: MtmCodingSkillSource } = {
  id: "example",
  label: "Example",
  description: "Test package.",
  icon: "code",
  kind: "data-only",
  skills: source,
};

describe("external coding skills", () => {
  it("installs verified documents once and preserves editable files", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "mtmharness-skills-"));
    const root = join(temporary, "example");
    const urls: string[] = [];
    const ctx = new Context();
    try {
      await ensureSkillPackage(packageManifest, {
        root,
        fetch: async (url) => {
          urls.push(url);
          return new Response(DOCUMENT);
        },
      });
      expect(urls).toEqual([
        "https://raw.githubusercontent.com/example/skills/" + source.revision + "/skills/example-skill/SKILL.md",
      ]);
      expect(await readFile(join(root, "example-skill", "SKILL.md"), "utf8")).toBe(DOCUMENT);

      await ctx.plugin(SkillRegistry);
      applyFileSkills(ctx, "test-external", root);
      const skill = await ctx.skills.get("example-skill");
      expect(skill).toMatchObject({ name: "example-skill", provider: "test-external", source: "custom" });

      await writeFile(join(root, "example-skill", "SKILL.md"), EDITED);
      await ensureSkillPackage(packageManifest, {
        root,
        fetch: async () => { throw new Error("existing roots must not download"); },
      });
      expect((await ctx.skills.get("example-skill"))?.content).toContain("User edit.");

      const invalidRoot = join(temporary, "invalid");
      const invalid = {
        ...packageManifest,
        id: "invalid",
        skills: { ...source, files: [{ ...source.files[0], sha256: "0".repeat(64) }] },
      };
      await expect(ensureSkillPackage(invalid, { root: invalidRoot, fetch: async () => new Response(DOCUMENT) }))
        .rejects.toThrow("checksum mismatch");
      await expect(readFile(join(invalidRoot, "example-skill", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });

      const unsafeRoot = join(temporary, "unsafe");
      const unsafe = {
        ...packageManifest,
        id: "unsafe",
        skills: { ...source, files: [{ ...source.files[0], path: "../SKILL.md" }] },
      };
      await expect(ensureSkillPackage(unsafe, { root: unsafeRoot, fetch: async () => new Response(DOCUMENT) }))
        .rejects.toThrow("invalid pinned skill source");
      await expect(readFile(join(unsafeRoot, "example-skill", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await ctx.fiber.dispose();
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
