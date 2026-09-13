import { describe, expect, it } from "vitest";
import { resolveLoginReturnTarget } from "./router";

describe("login return target", () => {
  it("recovers the requested internal route from login search", () => {
    expect(
      resolveLoginReturnTarget("?returnTo=%2Fworkspace%3Ftab%3Dfiles"),
    ).toBe("/workspace?tab=files");
  });

  it("falls back to the app root for invalid targets", () => {
    expect(
      resolveLoginReturnTarget("?returnTo=https%3A%2F%2Fevil.example%2F"),
    ).toBe("/");
  });
});
