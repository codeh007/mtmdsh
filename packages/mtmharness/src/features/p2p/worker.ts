import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { identify, identifyPush } from "@libp2p/identify";
import { webSockets } from "@libp2p/websockets";
import type { Libp2p, Stream } from "@libp2p/interface";
import { peerIdFromString } from "@libp2p/peer-id";
import { multiaddr } from "@multiformats/multiaddr";
import { createLibp2p } from "libp2p";
import {
  PEER_DISCOVERY_MAX_ADDRESSES,
  PEER_DISCOVERY_MAX_PROTOCOLS,
  PEER_DISCOVERY_PROTOCOL_ID,
  PEER_DISCOVERY_VERSION,
  fullPeerMultiaddrs,
  parsePeerDiscoveryRequest,
  parsePeerDiscoveryResponse,
  readPeerDiscoveryFrame,
  type PeerRecord,
  writePeerDiscoveryFrame,
} from "./peer-discovery.js";
import { createIdentity, loadStorage, restoreIdentity, saveStorage } from "./storage.js";
import { DEFAULT_TIMEOUT_MS, MAX_BODY_BYTES, type P2pHttpRequest, type P2pMessage, type P2pSnapshot, type P2pStatus, validateMessageId, validateRequest } from "./protocol.js";

const ports = new Set<MessagePort>();
const peers = new Map<string, { id: string; addresses: Set<string>; protocols: Set<string>; status: P2pStatus }>();
const activeRequests = new Map<string, { controller: AbortController; port: MessagePort }>();
const activeOperations = new Map<string, { controller: AbortController; port: MessagePort }>();
const activeTasks = new Set<Promise<void>>();
const storedPeers = new Set<string>();
let node: Libp2p | undefined;
let nodePromise: Promise<Libp2p> | undefined;
let status: P2pStatus = "idle";
let lastError: string | undefined;
let peerWriteChain: Promise<void> = Promise.resolve();
let stopPromise: Promise<void> | undefined;

async function getNode(): Promise<Libp2p> {
  if (stopPromise !== undefined) await stopPromise;
  if (node !== undefined) return node;
  if (nodePromise !== undefined) return nodePromise;
  status = "connecting";
  lastError = undefined;
  publish();
  nodePromise = initializeNode()
    .then((created) => {
      node = created;
      status = "connected";
      publish();
      return created;
    })
    .catch((error) => {
      nodePromise = undefined;
      status = "error";
      lastError = errorMessage(error);
      publish();
      throw error;
    });
  return nodePromise;
}

async function initializeNode(): Promise<Libp2p> {
  const storage = await loadStorage();
  let serializedKey = storage.privateKey;
  if (serializedKey === undefined) {
    serializedKey = (await createIdentity()).privateKey;
    await saveStorage({ ...storage, privateKey: serializedKey });
  }
  const { http: libp2pHttp } = await import("@libp2p/http");
  const created = await createLibp2p({
    privateKey: restoreIdentity(serializedKey),
    connectionEncrypters: [noise()],
    services: { http: libp2pHttp(), identify: identify(), identifyPush: identifyPush() },
    start: true,
    streamMuxers: [yamux()],
    transports: [webSockets()],
  });
  await created.handle(PEER_DISCOVERY_PROTOCOL_ID, (stream, connection) =>
    handlePeerDiscoveryStream(created, stream, connection.remotePeer.toString()),
  );
  for (const address of storage.peers) {
    try {
      const target = parsePeerAddress(address);
      rememberPeer(target, "idle");
      await created.peerStore.merge(target.id, { multiaddrs: [target.transport] });
    } catch {
      // Ignore stale addresses; identity and the usable peer book remain authoritative.
    }
  }
  for (const address of storage.peers) storedPeers.add(address);
  return created;
}

async function connectPeer(port: MessagePort, id: string, rawAddress: string, signal: AbortSignal): Promise<void> {
  try {
    validateMessageId(id);
    const target = parsePeerAddress(rawAddress);
    const created = await getNode();
    if (signal.aborted) throw new Error("p2p connection aborted");
    rememberPeer(target, "connecting");
    await created.peerStore.merge(target.id, { multiaddrs: [target.transport] });
    const connection = await created.dial(target.address, { signal });
    if (connection.remotePeer.toString() !== target.peerId) throw new Error("connected peer ID does not match the address");
    rememberPeer(target, "connected");
    await discover(created, connection, target.peerId);
    storedPeers.add(target.full);
    await persistPeers();
    safePost(port, { type: "result", id });
    publish();
  } catch (error) {
    rememberError(error);
    safePost(port, { type: "error", id, error: errorMessage(error) });
  }
}

async function disconnectPeer(port: MessagePort, id: string, peerId: string, signal: AbortSignal): Promise<void> {
  try {
    validateMessageId(id);
    const created = await getNode();
    const target = peerIdFromString(peerId);
    if (signal.aborted) throw new Error("p2p disconnection aborted");
    await created.hangUp(target);
    peers.delete(peerId);
    for (const address of [...storedPeers]) {
      if (address.endsWith("/p2p/" + peerId)) storedPeers.delete(address);
    }
    await persistPeers();
    safePost(port, { type: "result", id });
    publish();
  } catch (error) {
    rememberError(error);
    safePost(port, { type: "error", id, error: errorMessage(error) });
  }
}

async function handleRequest(port: MessagePort, request: P2pHttpRequest): Promise<void> {
  const controller = new AbortController();
  activeRequests.set(request.id, { controller, port });
  const timer = setTimeout(() => controller.abort(), request.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    validateRequest(request, MAX_BODY_BYTES);
    const created = await getNode();
    const target = await resolvePeerTarget(created, request);
    const resource = target.address.encapsulate(`/http-path/${encodeURIComponent(request.target.substring(1))}`);
    const httpService = created.services.http as unknown as {
      fetch(resource: ReturnType<typeof multiaddr>, init: RequestInit & { maxHeaderSize?: number }): Promise<Response>;
    };
    const response = await httpService.fetch(resource, {
      method: request.method,
      headers: new Headers([...request.headers]),
      body: request.body.byteLength === 0 ? undefined : (request.body as BodyInit),
      signal: controller.signal,
      maxHeaderSize: 32 * 1024,
    });
    const body = await readResponseBody(response, MAX_BODY_BYTES, controller.signal);
    safePost(
      port,
      {
        type: "response",
        response: {
          id: request.id,
          status: response.status,
          statusText: response.statusText,
          headers: [...response.headers],
          body,
        },
      },
      [body.buffer],
    );
    rememberPeer(target, "connected");
    storedPeers.add(target.full);
    await persistPeers();
    publish();
  } catch (error) {
    safePost(port, { type: "error", id: request.id, error: errorMessage(error) });
  } finally {
    clearTimeout(timer);
    activeRequests.delete(request.id);
  }
}

async function resolvePeerTarget(created: Libp2p, request: P2pHttpRequest): Promise<PeerTarget> {
  if (request.address !== undefined) return parsePeerAddress(request.address);
  if (request.peerId === undefined) throw new Error("p2p target is missing");
  const peer = peers.get(request.peerId);
  const address = peer?.addresses.values().next().value;
  if (address === undefined) throw new Error("p2p peer address is unavailable");
  const target = parsePeerAddress(address);
  await created.peerStore.merge(target.id, { multiaddrs: [target.transport] });
  return target;
}

async function discover(created: Libp2p, connection: Awaited<ReturnType<Libp2p["dial"]>>, remotePeer: string): Promise<void> {
  const stream = await connection.newStream(PEER_DISCOVERY_PROTOCOL_ID);
  try {
    await writePeerDiscoveryFrame(stream, { type: "get_peers", version: PEER_DISCOVERY_VERSION, peer_id: created.peerId.toString() });
    const response = parsePeerDiscoveryResponse(await readPeerDiscoveryFrame(stream));
    if (!response.peers.some((peer) => peer.peer_id === remotePeer)) throw new Error("peer discovery response does not include the connected peer");
    for (const record of response.peers) {
      for (const full of fullPeerMultiaddrs(record)) {
        try {
          const target = parsePeerAddress(full);
          rememberPeer(target, "idle", record.protocols);
          await created.peerStore.merge(target.id, { multiaddrs: [target.transport], protocols: record.protocols });
        } catch {
          // Ignore peers that this browser transport cannot dial.
        }
      }
    }
  } finally {
    await stream.close().catch(() => undefined);
  }
}

async function handlePeerDiscoveryStream(created: Libp2p, stream: Stream, remotePeer: string): Promise<void> {
  try {
    const request = parsePeerDiscoveryRequest(await readPeerDiscoveryFrame(stream));
    if (request.peer_id !== remotePeer) throw new Error("requesting peer ID does not match authenticated peer");
    await writePeerDiscoveryFrame(stream, {
      type: "peer_list",
      version: PEER_DISCOVERY_VERSION,
      peers: await peerRecords(created),
    });
  } catch {
    abortStream(stream);
  } finally {
    await stream.close().catch(() => undefined);
  }
}

async function peerRecords(created: Libp2p): Promise<PeerRecord[]> {
  const records: PeerRecord[] = [];
  for (const peer of await created.peerStore.all()) {
    const addresses = peer.addresses
      .map(({ multiaddr: address }) => transportAddress(address))
      .filter((address): address is string => address !== undefined)
      .slice(0, PEER_DISCOVERY_MAX_ADDRESSES);
    if (addresses.length === 0) continue;
    records.push({
      peer_id: peer.id.toString(),
      addresses,
      protocols: [...new Set(peer.protocols)].slice(0, PEER_DISCOVERY_MAX_PROTOCOLS),
    });
  }
  return records.slice(0, 128);
}

function parsePeerAddress(raw: string): PeerTarget {
  const address = multiaddr(raw);
  const components = address.getComponents();
  const suffix = components.at(-1);
  if (suffix === undefined || (suffix.name !== "p2p" && suffix.name !== "ipfs")) throw new Error("p2p address must end with a peer ID");
  if (components.length !== 4 || !["ip4", "ip6", "dns", "dns4", "dns6"].includes(components[0]?.name ?? "") || components[1]?.name !== "tcp" || !["ws", "wss"].includes(components[2]?.name ?? "")) {
    throw new Error("browser p2p address must use a WebSocket transport");
  }
  if (suffix.value === undefined) throw new Error("p2p address peer ID is missing");
  const id = peerIdFromString(suffix.value);
  const transportRaw = transportAddress(address);
  if (transportRaw === undefined) throw new Error("p2p address transport is invalid");
  const transport = multiaddr(transportRaw);
  return { address, full: address.toString(), id, peerId: id.toString(), transport };
}

type PeerTarget = {
  address: ReturnType<typeof multiaddr>;
  full: string;
  id: ReturnType<typeof peerIdFromString>;
  peerId: string;
  transport: ReturnType<typeof multiaddr>;
};

function transportAddress(address: ReturnType<typeof multiaddr>): string | undefined {
  const components = address.getComponents();
  const peerIndex = components.findIndex((component) => component.name === "p2p" || component.name === "ipfs");
  const transport = components.slice(0, peerIndex === -1 ? components.length : peerIndex);
  const host = transport[0];
  if (host === undefined || !["ip4", "ip6", "dns", "dns4", "dns6"].includes(host.name)) return undefined;
  if (transport[1]?.name !== "tcp" || !["ws", "wss"].includes(transport[2]?.name ?? "")) return undefined;
  return transport.reduce((value, component) => value + "/" + component.name + (component.value === undefined ? "" : "/" + component.value), "");
}

async function readResponseBody(response: Response, maxBytes: number, signal: AbortSignal): Promise<Uint8Array> {
  if (response.body === null) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error("p2p request aborted");
      const { done, value } = await reader.read();
      if (done) {
        const body = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
        return body;
      }
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("response body exceeds maximum");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function rememberPeer(target: PeerTarget, nextStatus: P2pStatus, protocols: readonly string[] = []): void {
  const peer = peers.get(target.peerId) ?? { id: target.peerId, addresses: new Set<string>(), protocols: new Set<string>(), status: nextStatus };
  peer.addresses.add(target.full);
  for (const protocol of protocols) peer.protocols.add(protocol);
  peer.status = nextStatus;
  peers.set(target.peerId, peer);
}

function persistPeers(): Promise<void> {
  const write = peerWriteChain.then(async () => {
    const storage = await loadStorage();
    await saveStorage({ ...storage, peers: [...storedPeers].slice(0, 128) });
  });
  peerWriteChain = write.then(() => undefined, () => undefined);
  return write;
}

function publish(): void {
  const snapshot: P2pSnapshot = {
    status,
    ...(node === undefined ? {} : { peerId: node.peerId.toString() }),
    peers: [...peers.values()].map((peer) => ({ id: peer.id, addresses: [...peer.addresses], protocols: [...peer.protocols], status: peer.status })),
    ...(lastError === undefined ? {} : { error: lastError }),
  };
  for (const port of ports) safePost(port, { type: "snapshot", snapshot });
}

function rememberError(error: unknown): void {
  lastError = errorMessage(error);
  publish();
}

function abortStream(stream: Stream): void {
  stream.abort(new Error("p2p stream aborted"));
}

function safePost(port: MessagePort, message: P2pMessage, transfer: Transferable[] = []): void {
  try {
    port.postMessage(message, transfer);
  } catch {
    ports.delete(port);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function trackTask(task: Promise<void>): void {
  activeTasks.add(task);
  void task.then(
    () => activeTasks.delete(task),
    () => activeTasks.delete(task),
  );
}

async function stopNode(): Promise<void> {
  if (stopPromise !== undefined) return stopPromise;
  stopPromise = (async () => {
    for (const active of activeRequests.values()) active.controller.abort();
    for (const active of activeOperations.values()) active.controller.abort();
    await Promise.all([...activeTasks]);
    const current = nodePromise;
    if (current !== undefined) {
      try {
        await (await current).stop();
      } catch (error) {
        rememberError(error);
      }
    }
    node = undefined;
    nodePromise = undefined;
    status = "idle";
    publish();
  })();
  try {
    await stopPromise;
  } finally {
    stopPromise = undefined;
  }
}

function runOperation(port: MessagePort, id: string, operation: (signal: AbortSignal) => Promise<void>): void {
  const controller = new AbortController();
  activeOperations.set(id, { controller, port });
  trackTask(operation(controller.signal).finally(() => activeOperations.delete(id)));
}

function detachPort(port: MessagePort): void {
  for (const [id, active] of activeRequests) {
    if (active.port === port) {
      active.controller.abort();
      activeRequests.delete(id);
    }
  }
  for (const [id, active] of activeOperations) {
    if (active.port === port) {
      active.controller.abort();
      activeOperations.delete(id);
    }
  }
  ports.delete(port);
  if (ports.size === 0) void stopNode();
}

async function handle(port: MessagePort, message: P2pMessage): Promise<void> {
  if (message.type === "connect") {
    runOperation(port, message.id, (signal) => connectPeer(port, message.id, message.address, signal));
    return;
  }
  if (message.type === "disconnect") {
    runOperation(port, message.id, (signal) => disconnectPeer(port, message.id, message.peerId, signal));
    return;
  }
  if (message.type === "request") {
    trackTask(handleRequest(port, message.request));
    return;
  }
  if (message.type === "cancel") {
    activeRequests.get(message.id)?.controller.abort();
    activeOperations.get(message.id)?.controller.abort();
    return;
  }
  if (message.type === "detach") detachPort(port);
}

(self as unknown as { onconnect: (event: MessageEvent) => void }).onconnect = (event: MessageEvent) => {
  const port = (event as unknown as { ports: MessagePort[] }).ports[0];
  if (port === undefined) return;
  ports.add(port);
  port.onmessage = (input: MessageEvent<P2pMessage>) => void handle(port, input.data);
  port.onmessageerror = () => detachPort(port);
  port.start();
  publish();
  void getNode().catch(() => undefined);
};
