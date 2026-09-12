import type { Stream } from "@libp2p/interface";
import { describe, expect, it } from "vitest";
import {
  encodePeerDiscoveryFrame,
  fullPeerMultiaddrs,
  parsePeerDiscoveryResponse,
  parsePeerRecord,
  readPeerDiscoveryFrame,
} from "./peer-discovery.ts";

const peerId = "12D3KooWKnDdG3iXw9eTFijk3EWSunZcFi54Zka4wmtqtt6rPxc8";
const peerRecord = {
  addresses: ["/dns4/example.com/tcp/443/wss"],
  peer_id: peerId,
  protocols: ["/gomtm/peer-discovery/1.0.0"],
};

function streamFrom(chunks: Uint8Array[]): Stream {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk;
    },
  } as unknown as Stream;
}

describe("gomtm peer discovery wire contract", () => {
  it("reads a big-endian frame split across chunks", async () => {
    const frame = encodePeerDiscoveryFrame({ type: "get_peers", version: 1, peer_id: peerId });
    await expect(readPeerDiscoveryFrame(streamFrom([frame.subarray(0, 3), frame.subarray(3)]))).resolves.toEqual({
      type: "get_peers",
      version: 1,
      peer_id: peerId,
    });
  });

  it("validates transport-only records and adds the peer suffix", () => {
    expect(parsePeerDiscoveryResponse({ type: "peer_list", version: 1, peers: [peerRecord] }).peers).toEqual([
      peerRecord,
    ]);
    expect(fullPeerMultiaddrs(peerRecord)).toEqual(["/dns4/example.com/tcp/443/wss/p2p/" + peerId]);
    expect(() =>
      parsePeerRecord({ ...peerRecord, addresses: ["/dns4/example.com/tcp/443/wss/p2p/" + peerId] }),
    ).toThrow("peer suffix");
  });

  it("rejects trailing frames", async () => {
    const first = encodePeerDiscoveryFrame({ type: "get_peers", version: 1, peer_id: peerId });
    const second = encodePeerDiscoveryFrame({ type: "get_peers", version: 1, peer_id: peerId });
    const combined = new Uint8Array(first.byteLength + second.byteLength);
    combined.set(first);
    combined.set(second, first.byteLength);
    await expect(readPeerDiscoveryFrame(streamFrom([combined]))).rejects.toThrow("trailing data");
  });
});
