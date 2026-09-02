/* @vitest-environment node */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import { describe, expect, it } from "vitest";
import { applyFileSkills, ensureSkillPackage } from "../src/skill-files.ts";
import type { MtmCodingPackageManifest, MtmCodingSkillSource } from "../src/features/coding/manifest.ts";

const DOCUMENT = "---\r\n# Metadata may be reordered.\r\ndescription: >\r\n  Test external skill.\r\nwhenToUse: Verify YAML frontmatter parsing.\r\nname: example-skill # inline comments are valid.\r\n---\r\n\r\n# External\r\n\r\nOriginal body.\r\n";
const EDITED = DOCUMENT.replace("Original body.", "User edit.");
const RESOURCE = "resource payload\n";
const source: MtmCodingSkillSource = {
  repository: "https://github.com/example/skills",
  revision: "a".repeat(40),
  files: [{
    name: "example-skill",
    path: "skills/example-skill/SKILL.md",
    sha256: createHash("sha256").update(DOCUMENT).digest("hex"),
  }, {
    name: "example-skill",
    path: "skills/example-skill/scripts/run-tool.sh",
    sha256: createHash("sha256").update(RESOURCE).digest("hex"),
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
          return new Response(url.endsWith("/scripts/run-tool.sh") ? RESOURCE : DOCUMENT);
        },
      });
      expect(urls).toEqual([
        "https://raw.githubusercontent.com/example/skills/" + source.revision + "/skills/example-skill/SKILL.md",
        "https://raw.githubusercontent.com/example/skills/" + source.revision + "/skills/example-skill/scripts/run-tool.sh",
      ]);
      expect(await readFile(join(root, "example-skill", "SKILL.md"), "utf8")).toBe(DOCUMENT);
      expect(await readFile(join(root, "example-skill", "scripts", "run-tool.sh"), "utf8")).toBe(RESOURCE);

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

      const legacyRoot = join(temporary, "legacy");
      await mkdir(join(legacyRoot, "example-skill"), { recursive: true });
      await writeFile(join(legacyRoot, "example-skill", "SKILL.md"), DOCUMENT);
      const legacyUrls: string[] = [];
      await ensureSkillPackage(packageManifest, {
        root: legacyRoot,
        fetch: async (url) => {
          legacyUrls.push(url);
          return new Response(RESOURCE);
        },
      });
      expect(legacyUrls).toHaveLength(1);
      expect(await readFile(join(legacyRoot, "example-skill", "SKILL.md"), "utf8")).toBe(DOCUMENT);
      expect(await readFile(join(legacyRoot, "example-skill", "scripts", "run-tool.sh"), "utf8")).toBe(RESOURCE);

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
        .rejects.toThrow("invalid skill metadata");
      await expect(readFile(join(unsafeRoot, "example-skill", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await ctx.fiber.dispose();
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it("cancels an in-flight bundle install without leaving a partial root", async () => {
    const temporary = await mkdtemp(join(tmpdir(), "mtmharness-skill-cancel-"));
    const root = join(temporary, "cancelled");
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => { resolveStarted = resolve; });
    const controller = new AbortController();
    try {
      const pending = ensureSkillPackage({ ...packageManifest, id: "cancelled" }, {
        root,
        signal: controller.signal,
        fetch: async (_url, init) => new Promise<Response>((_resolve, reject) => {
          resolveStarted();
          init?.signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
        }),
      });
      await started;
      controller.abort();
      await expect(pending).rejects.toThrow("cancelled");
      await expect(readFile(root, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
