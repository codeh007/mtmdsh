/* @vitest-environment node */
import { Context } from "@deepseek-ai/cordis";
import SkillRegistry from "@deepseek-ai/dsh-skill";
import { describe, expect, it } from "vitest";
import { applyFileSkills, skillDirectory } from "../src/skill-files.ts";

describe("bundled coding skills", () => {
  it("loads package-relative documents through the official filesystem provider", async () => {
    const ctx = new Context();
    await ctx.plugin(SkillRegistry);
    applyFileSkills(ctx, "test-ponytail", "ponytail");
    applyFileSkills(ctx, "test-modern-go", "use-modern-go");
    applyFileSkills(ctx, "test-rtk", "rtk");

    const skills = await ctx.skills.list();
    expect(skills.map((skill) => skill.name)).toEqual([
      "ponytail",
      "ponytail-audit",
      "ponytail-debt",
      "ponytail-gain",
      "ponytail-help",
      "ponytail-review",
      "rtk",
      "use-modern-go",
    ]);
    expect(skills.every((skill) => skill.source === "bundled")).toBe(true);
    expect(skills.find((skill) => skill.name === "ponytail")?.resourceBase).toEqual({
      kind: "directory",
      path: skillDirectory("ponytail"),
    });
    expect((await ctx.skills.get("use-modern-go"))?.content).toContain("go-modern-guidelines@v0.1.1");
    expect((await ctx.skills.get("ponytail-review"))?.path).toMatch(/src[/\\]skills[/\\]ponytail[/\\]ponytail-review[/\\]SKILL\.md$/);

    await ctx.fiber.dispose();
  });
});
