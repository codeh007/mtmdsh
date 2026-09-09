import { describe, expect, it } from "vitest";
import { validateRequest, validateMessageId } from "./protocol.ts";
describe("p2p validation", () => {
  it("rejects malformed ids", () =>
    expect(() => validateMessageId("bad id")).toThrow());
  it("rejects oversized payloads", () =>
    expect(() =>
      validateRequest({ id: "x", peerId: "p", payload: new Uint8Array(3) }, 2),
    ).toThrow());
  it("accepts bounded requests", () =>
    expect(() =>
      validateRequest(
        { id: "x", peerId: "p", payload: new Uint8Array(2), timeoutMs: 10 },
        2,
      ),
    ).not.toThrow());
});
