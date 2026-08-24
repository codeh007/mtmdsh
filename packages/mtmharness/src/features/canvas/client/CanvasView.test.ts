import { describe, expect, it } from "vitest";
import { resolvePrompt } from "./prompt.ts";

describe("Canvas prompt selection", () => {
  it("falls back to the selected prompt when the draft is whitespace", () => {
    expect(resolvePrompt("  new direction  ", "selected direction")).toBe("new direction");
    expect(resolvePrompt("   ", "selected direction")).toBe("selected direction");
    expect(resolvePrompt("   ", undefined)).toBe("");
  });
});
