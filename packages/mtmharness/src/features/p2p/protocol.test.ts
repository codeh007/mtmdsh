import { describe, expect, it } from "vitest";
import { validateMessageId, validateRequest } from "./protocol.ts";

describe("p2p control message validation", () => {
  it("rejects malformed message IDs", () => {
    expect(() => validateMessageId("bad id")).toThrow();
  });

  it("rejects oversized HTTP bodies", () => {
    expect(() =>
      validateRequest(
        {
          id: "x",
          peerId: "peer",
          method: "POST",
          target: "/healthz",
          headers: [],
          body: new Uint8Array(3),
        },
        2,
      ),
    ).toThrow();
  });

  it("accepts a bounded peer-targeted HTTP request", () => {
    expect(() =>
      validateRequest({
        id: "x",
        peerId: "peer",
        method: "GET",
        target: "/healthz",
        headers: [],
        body: new Uint8Array(),
        timeoutMs: 10,
      }),
    ).not.toThrow();
  });

  it("requires exactly one peer target", () => {
    expect(() =>
      validateRequest({
        id: "x",
        peerId: "peer",
        address: "/ip4/127.0.0.1/tcp/1/ws/p2p/peer",
        method: "GET",
        target: "/healthz",
        headers: [],
        body: new Uint8Array(),
      }),
    ).toThrow();
  });
});
