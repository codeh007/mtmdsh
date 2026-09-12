import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";

export type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>;

export interface P2pStorage {
  readonly privateKey?: Uint8Array;
  readonly peers: readonly string[];
}

const DB = "mtmharness-p2p";
const STORE = "state";
let database: Promise<IDBDatabase> | undefined;

export async function loadStorage(): Promise<P2pStorage> {
  if (typeof indexedDB === "undefined") return { peers: [] };
  return normalize(await read());
}

export async function saveStorage(state: P2pStorage): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(
      { privateKey: state.privateKey ? new Uint8Array(state.privateKey) : undefined, peers: [...state.peers] },
      "state",
    );
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function createIdentity(): Promise<{ privateKey: Uint8Array }> {
  return { privateKey: privateKeyToProtobuf(await generateKeyPair("Ed25519")) };
}

export function restoreIdentity(bytes: Uint8Array): PrivateKey {
  return privateKeyFromProtobuf(bytes);
}

async function read(): Promise<unknown> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function normalize(value: unknown): P2pStorage {
  if (typeof value !== "object" || value === null) return { peers: [] };
  const stored = value as { privateKey?: unknown; peers?: unknown };
  return {
    privateKey: stored.privateKey instanceof Uint8Array ? new Uint8Array(stored.privateKey) : undefined,
    peers: Array.isArray(stored.peers) ? stored.peers.filter((peer): peer is string => typeof peer === "string") : [],
  };
}

function open(): Promise<IDBDatabase> {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return database;
}
