// Binary WebSocket messages stay on a dedicated port, separate from unary HTTP.
export const SOCKET_BUFFER_LIMIT = 8 * 1024 * 1024;
export const SOCKET_LEASE_MS = 120_000;

export type SocketMessage =
  | { type: "open" }
  | { type: "data"; data: ArrayBuffer }
  | { type: "ack"; bytes: number }
  | { type: "close"; reason: string }
  | { type: "ping" };

/** WebSocket-shaped channel consumed by upstream RFB; no RFB framing here. */
export class P2pSocket extends EventTarget {
  readonly protocol = "binary";
  binaryType = "arraybuffer";
  readyState = 0;
  bufferedAmount = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<ArrayBuffer>) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private readonly heartbeat: ReturnType<typeof setInterval>;
  private readonly timeout: ReturnType<typeof setTimeout>;

  constructor(
    private readonly port: MessagePort,
    private readonly dispose: () => void,
    signal?: AbortSignal,
  ) {
    super();
    this.port.onmessage = ({ data }: MessageEvent<SocketMessage>) => {
      if (this.readyState === 3) return;
      if (data.type === "open") {
        clearTimeout(this.timeout);
        this.readyState = 1;
        const event = new Event("open");
        this.onopen?.(event);
        this.dispatchEvent(event);
      } else if (data.type === "data") {
        try {
          const event = new MessageEvent("message", { data: data.data });
          this.onmessage?.(event);
          this.dispatchEvent(event);
        } finally {
          this.port.postMessage({
            type: "ack",
            bytes: data.data.byteLength,
          } satisfies SocketMessage);
        }
      } else if (data.type === "ack") {
        this.bufferedAmount = Math.max(0, this.bufferedAmount - data.bytes);
      } else if (data.type === "close") {
        this.finish(data.reason);
      }
    };
    this.port.onmessageerror = () =>
      this.close(1002, "Invalid transport message");
    this.port.start();
    this.heartbeat = setInterval(() => {
      this.port.postMessage({ type: "ping" } satisfies SocketMessage);
    }, SOCKET_LEASE_MS / 4);
    this.timeout = setTimeout(
      () => this.close(1006, "Connection timed out"),
      15_000,
    );
    const abort = () => this.close();
    signal?.addEventListener("abort", abort, { once: true });
    globalThis.addEventListener?.("pagehide", abort);
    this.addEventListener(
      "close",
      () => {
        signal?.removeEventListener("abort", abort);
        globalThis.removeEventListener?.("pagehide", abort);
      },
      { once: true },
    );
    if (signal?.aborted) queueMicrotask(abort);
  }

  send(data: ArrayBuffer | ArrayBufferView): void {
    if (this.readyState !== 1) throw new Error("P2P socket is not open");
    // RFB reuses its send buffer. Never transfer/detach the caller's backing store.
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.byteLength + this.bufferedAmount > SOCKET_BUFFER_LIMIT) {
      this.close(1009, "Outgoing desktop data exceeded transport buffer");
      return;
    }
    const copy = bytes.slice().buffer;
    this.bufferedAmount += copy.byteLength;
    this.port.postMessage(
      { type: "data", data: copy } satisfies SocketMessage,
      [copy],
    );
  }

  close(_code = 1000, reason = ""): void {
    if (this.readyState === 3) return;
    try {
      this.port.postMessage({ type: "close", reason } satisfies SocketMessage);
    } finally {
      this.finish(reason);
    }
  }

  private finish(reason: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    clearInterval(this.heartbeat);
    clearTimeout(this.timeout);
    this.port.onmessage = null;
    this.port.close();
    this.dispose();
    const event = new CloseEvent("close", {
      code: reason === "" ? 1000 : 1006,
      reason,
      wasClean: reason === "",
    });
    this.onclose?.(event);
    this.dispatchEvent(event);
  }
}
