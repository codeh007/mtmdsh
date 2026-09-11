// @vitest-environment node

import { describe, expect, it } from "vitest";
import { generateKeyPair } from "@libp2p/crypto/keys";
import { privateKeyToProtobuf } from "@libp2p/crypto/keys";
import { restoreIdentity } from "./storage.ts";
describe("identity persistence", () => {
  it("round-trips a serialized Ed25519 key", async () => {
    const key = await generateKeyPair("Ed25519");
    const restored = restoreIdentity(privateKeyToProtobuf(key));
    expect(restored.type).toBe(key.type);
    expect(restored.publicKey.raw).toEqual(key.publicKey.raw);
  });
});
