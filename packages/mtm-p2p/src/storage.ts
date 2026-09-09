import { generateKeyPair, privateKeyFromProtobuf, privateKeyToProtobuf } from "@libp2p/crypto/keys";
import type { PrivateKey } from "@libp2p/interface";
export interface P2pStorage { readonly identity: string; readonly privateKey?: Uint8Array; readonly peers: readonly string[] }
const DB = "mtm-p2p", STORE = "state";
export async function loadStorage(): Promise<P2pStorage> { if (typeof indexedDB === "undefined") return createState(); const value = await get(); if (value && typeof value === "object" && "identity" in value) return normalize(value as P2pStorage); const state = createState(); await saveStorage(state); return state }
export async function saveStorage(state: P2pStorage): Promise<void> { if (typeof indexedDB === "undefined") return; const db = await open(); await new Promise<void>((resolve, reject) => { const r = db.transaction(STORE, "readwrite").objectStore(STORE).put({ ...state, privateKey: state.privateKey ? new Uint8Array(state.privateKey) : undefined }, "state"); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); }); }
export async function createIdentity(): Promise<{ identity: string; privateKey: Uint8Array }> { const key = await generateKeyPair("Ed25519"); return { identity: key.publicKey.raw ? key.publicKey.raw.toString() : "", privateKey: privateKeyToProtobuf(key) }; }
export function restoreIdentity(bytes: Uint8Array): PrivateKey { return privateKeyFromProtobuf(bytes); }
function createState(): P2pStorage { return { identity: crypto.randomUUID(), peers: [] }; }
function normalize(value: P2pStorage): P2pStorage { return { identity: value.identity, privateKey: value.privateKey ? new Uint8Array(value.privateKey) : undefined, peers: Array.isArray(value.peers) ? [...value.peers] : [] }; }
function get(): Promise<unknown> { return open().then(db => new Promise((resolve, reject) => { const r = db.transaction(STORE).objectStore(STORE).get("state"); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); })); }
function open(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
