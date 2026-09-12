export const DEFAULT_TIMEOUT_MS = 10000;
export const MAX_BODY_BYTES = 1024 * 1024;

export type P2pStatus = "idle" | "connecting" | "connected" | "closed" | "error";

export interface P2pPeer {
  readonly id: string;
  readonly addresses: readonly string[];
  readonly protocols: readonly string[];
  readonly status: P2pStatus;
}

export interface P2pSnapshot {
  readonly status: P2pStatus;
  readonly peerId?: string;
  readonly peers: readonly P2pPeer[];
  readonly error?: string;
}

export interface P2pHttpRequest {
  readonly id: string;
  readonly peerId?: string;
  readonly address?: string;
  readonly method: string;
  readonly target: string;
  readonly headers: readonly [string, string][];
  readonly body: Uint8Array;
  readonly timeoutMs?: number;
}

export interface P2pHttpResponse {
  readonly id: string;
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly [string, string][];
  readonly body: Uint8Array;
}

export type P2pMessage =
  | { type: "snapshot"; snapshot: P2pSnapshot }
  | { type: "connect"; id: string; address: string }
  | { type: "disconnect"; id: string; peerId: string }
  | { type: "request"; request: P2pHttpRequest }
  | { type: "cancel"; id: string }
  | { type: "detach" }
  | { type: "result"; id: string }
  | { type: "response"; response: P2pHttpResponse }
  | { type: "error"; id?: string; error: string };

export function validateMessageId(id: string): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) throw new Error("invalid message id");
}

export function validateRequest(request: P2pHttpRequest, maxBodyBytes = MAX_BODY_BYTES): void {
  validateMessageId(request.id);
  if ((request.peerId === undefined) === (request.address === undefined)) {
    throw new Error("exactly one p2p target is required");
  }
  if (request.peerId !== undefined && request.peerId.length === 0) throw new Error("peer id is required");
  if (request.address !== undefined && request.address.length === 0) throw new Error("peer address is required");
  if (!(request.body instanceof Uint8Array) || request.body.byteLength > maxBodyBytes) {
    throw new Error("request body exceeds maximum");
  }
  if (!/^[A-Z0-9!#$%&'*+.^_`|~-]+$/.test(request.method)) throw new Error("invalid HTTP method");
  if (!request.target.startsWith("/") || request.target.includes("#")) throw new Error("invalid HTTP target");
  if (!Array.isArray(request.headers) || request.headers.some(([name, value]) => typeof name !== "string" || typeof value !== "string") || request.headers.reduce((size, [name, value]) => size + name.length + value.length, 0) > 32 * 1024) {
    throw new Error("request headers exceed maximum");
  }
  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0 || request.timeoutMs > 300000)
  ) {
    throw new Error("invalid timeout");
  }
}
