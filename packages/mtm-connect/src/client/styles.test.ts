import { describe, expect, it } from "vitest";
import { MTM_CONNECT_CSS } from "./styles.ts";

describe("mtm-connect stylesheet", () => {
  it("uses DSH semantic tokens without global theme ownership", () => {
    expect(MTM_CONNECT_CSS).toContain("--dsw-alias-label-primary");
    expect(MTM_CONNECT_CSS).toContain("--dsw-alias-state-business-primary");
    expect(MTM_CONNECT_CSS).toContain("@container (min-width: 680px)");
    expect(MTM_CONNECT_CSS).not.toMatch(/:root\b/);
    expect(MTM_CONNECT_CSS).not.toMatch(/--mtmc-/);
    expect(MTM_CONNECT_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(MTM_CONNECT_CSS).not.toContain("body[data-ds-dark-theme]");
    expect(MTM_CONNECT_CSS).toContain("[data-mtm-connect] .mtmc-summary");
    expect(MTM_CONNECT_CSS).toContain("max-height: calc(100vh - 180px)");
    expect(MTM_CONNECT_CSS).toContain("overflow-y: auto");
  });
});
