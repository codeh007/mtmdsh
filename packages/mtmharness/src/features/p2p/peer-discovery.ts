import type { Stream } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";

export const PEER_DISCOVERY_PROTOCOL_ID = "/gomtm/peer-discovery/1.0.0";
export const PEER_DISCOVERY_VERSION = 1;
export const PEER_DISCOVERY_MAX_FRAME_SIZE = 64 * 1024;
export const PEER_DISCOVERY_MAX_PEERS = 128;
export const PEER_DISCOVERY_MAX_ADDRESSES = 8;
export const PEER_DISCOVERY_MAX_PROTOCOLS = 32;
export const PEER_DISCOVERY_MAX_STRING_LENGTH = 512;

export type PeerRecord = {
  peer_id: string;
  addresses: string[];
  protocols: string[];
};

export type PeerDiscoveryResponse = {
  type: "peer_list";
  version: typeof PEER_DISCOVERY_VERSION;
  peers: PeerRecord[];
};

export function encodePeerDiscoveryFrame(value: unknown): Uint8Array {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("peer discovery frame must be JSON serializable");
  const body = new TextEncoder().encode(encoded);
  if (body.byteLength === 0 || body.byteLength > PEER_DISCOVERY_MAX_FRAME_SIZE) throw new Error("peer discovery frame exceeds the protocol limit");
  const frame = new Uint8Array(4 + body.byteLength);
  new DataView(frame.buffer).setUint32(0, body.byteLength);
  frame.set(body, 4);
  return frame;
}

export async function writePeerDiscoveryFrame(stream: Stream, value: unknown): Promise<void> {
  const frame = encodePeerDiscoveryFrame(value);
  if (!stream.send(frame)) await stream.onDrain();
}

export async function readPeerDiscoveryFrame(stream: Stream): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  let expectedLength: number | undefined;
  for await (const chunk of stream) {
    const bytes = toUint8Array(chunk);
    chunks.push(bytes);
    const frame = concat(...chunks);
    if (frame.byteLength > PEER_DISCOVERY_MAX_FRAME_SIZE + 4) throw new Error("peer discovery frame exceeds the protocol limit");
    if (expectedLength === undefined && frame.byteLength >= 4) {
      expectedLength = new DataView(frame.buffer, frame.byteOffset, 4).getUint32(0) + 4;
      if (expectedLength <= 4 || expectedLength > PEER_DISCOVERY_MAX_FRAME_SIZE + 4) throw new Error("peer discovery frame exceeds the protocol limit");
    }
    if (expectedLength !== undefined) {
      if (frame.byteLength > expectedLength) throw new Error("peer discovery stream contains trailing data");
      if (frame.byteLength === expectedLength) return JSON.parse(new TextDecoder().decode(frame.subarray(4)));
    }
  }
  throw new Error("peer discovery stream ended before a frame was received");
}

export function parsePeerDiscoveryRequest(value: unknown): { type: "get_peers"; version: 1; peer_id: string } {
  if (!isRecord(value) || value.type !== "get_peers" || value.version !== PEER_DISCOVERY_VERSION || typeof value.peer_id !== "string" || value.peer_id.length === 0 || value.peer_id.length > PEER_DISCOVERY_MAX_STRING_LENGTH) {
    throw new Error("invalid peer discovery request");
  }
  return { type: "get_peers", version: 1, peer_id: value.peer_id };
}

export function parsePeerDiscoveryResponse(value: unknown): PeerDiscoveryResponse {
  if (!isRecord(value) || value.type !== "peer_list" || value.version !== PEER_DISCOVERY_VERSION || !Array.isArray(value.peers) || value.peers.length > PEER_DISCOVERY_MAX_PEERS) {
    throw new Error("invalid peer discovery response");
  }
  return { type: "peer_list", version: 1, peers: value.peers.map(parsePeerRecord) };
}

export function parsePeerRecord(value: unknown): PeerRecord {
  if (!isRecord(value) || typeof value.peer_id !== "string" || value.peer_id.length === 0 || value.peer_id.length > PEER_DISCOVERY_MAX_STRING_LENGTH || !Array.isArray(value.addresses) || value.addresses.length === 0 || value.addresses.length > PEER_DISCOVERY_MAX_ADDRESSES || !Array.isArray(value.protocols) || value.protocols.length > PEER_DISCOVERY_MAX_PROTOCOLS) {
    throw new Error("invalid peer discovery record");
  }
  try {
    peerIdFromString(value.peer_id);
  } catch {
    throw new Error("invalid peer discovery peer id");
  }
  const addresses = value.addresses.map((value) => {
    if (typeof value !== "string" || value.length === 0 || value.length > PEER_DISCOVERY_MAX_STRING_LENGTH) throw new Error("invalid peer discovery address");
    const address = multiaddr(value);
    if (address.getComponents().some((component) => component.name === "p2p" || component.name === "ipfs")) throw new Error("peer discovery addresses must not include a peer suffix");
    return address.toString();
  });
  const protocols = value.protocols.map((value) => {
    if (typeof value !== "string" || value.length === 0 || value.length > PEER_DISCOVERY_MAX_STRING_LENGTH) throw new Error("invalid peer discovery protocol");
    return value;
  });
  return { peer_id: value.peer_id, addresses: [...new Set(addresses)], protocols: [...new Set(protocols)] };
}

export function fullPeerMultiaddrs(record: PeerRecord): string[] {
  const peerAddress = multiaddr("/p2p/" + record.peer_id);
  return record.addresses.map((address) => multiaddr(address).encapsulate(peerAddress).toString());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function toUint8Array(chunk: Uint8Array | { subarray(): Uint8Array }): Uint8Array {
  return chunk instanceof Uint8Array ? chunk : chunk.subarray();
}
