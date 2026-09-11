export const DEFAULT_TIMEOUT_MS = 10000;
export const MAX_PAYLOAD_BYTES = 1048576;
export type P2pStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "closed"
  | "error";
export interface P2pPeer {
  readonly id: string;
  readonly addresses: readonly string[];
  readonly status: P2pStatus;
}
export interface P2pSnapshot {
  readonly status: P2pStatus;
  readonly peerId?: string;
  readonly peers: readonly P2pPeer[];
  readonly error?: string;
}
export interface Request {
  readonly id: string;
  readonly peerId: string;
  readonly payload: Uint8Array;
  readonly timeoutMs?: number;
}
export type P2pMessage =
  | { type: "snapshot"; snapshot: P2pSnapshot }
  | { type: "request"; request: Request }
  | { type: "disconnect" }
  | { type: "response"; id: string; payload: Uint8Array }
  | { type: "error"; id?: string; error: string };
export function validateRequest(
  request: Request,
  maxPayload = MAX_PAYLOAD_BYTES,
): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(request.id))
    throw new Error("invalid message id");
  if (!request.peerId) throw new Error("peer id is required");
  if (
    !(request.payload instanceof Uint8Array) ||
    request.payload.byteLength > maxPayload
  )
    throw new Error("payload exceeds maximum");
  if (
    request.timeoutMs !== undefined &&
    (!Number.isFinite(request.timeoutMs) ||
      request.timeoutMs <= 0 ||
      request.timeoutMs > 300000)
  )
    throw new Error("invalid timeout");
}
export function validateMessageId(id: string): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id))
    throw new Error("invalid message id");
}
