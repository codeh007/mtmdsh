import type { Context as ClientContext } from "@deepseek-ai/cordis";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_BODY_BYTES,
  type P2pHttpRequest,
  type P2pMessage,
  type P2pSnapshot,
  validateMessageId,
  validateRequest,
} from "./protocol.js";

export * from "./protocol.js";

export interface P2pClientOptions {
  readonly worker?: SharedWorker;
  readonly workerUrl?: string;
  readonly maxBodyBytes?: number;
  readonly timeoutMs?: number;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanup: () => void;
};

const initial: P2pSnapshot = { status: "idle", peers: [] };

export class MtmP2pClient {
  private snapshot = freeze(initial);
  private readonly listeners = new Set<() => void>();
  private readonly pending = new Map<string, Pending>();
  private readonly port?: MessagePort;
  private readonly maxBodyBytes: number;
  private readonly timeoutMs: number;
  private closed = false;

  constructor(options: P2pClientOptions = {}) {
    this.maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const worker =
      options.worker ??
      (options.workerUrl !== undefined && typeof SharedWorker !== "undefined"
        ? new SharedWorker(options.workerUrl, { type: "module" })
        : undefined);
    if (worker === undefined) {
      this.snapshot = freeze({ status: "error", peers: [], error: "p2p SharedWorker is unavailable" });
      return;
    }
    this.port = worker.port;
    this.port.onmessage = (event: MessageEvent<P2pMessage>) => this.receive(event.data);
    this.port.onmessageerror = () => this.publish({ ...this.snapshot, status: "error", error: "p2p message could not be decoded" });
    this.port.start();
  }

  getSnapshot = (): P2pSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  connect = (address: string): Promise<void> => {
    if (address.trim() === "") return Promise.reject(new Error("p2p address is required"));
    this.publish({ ...this.snapshot, status: "connecting", error: undefined });
    const id = crypto.randomUUID();
    return this.wait<void>(id, { type: "connect", id, address }, this.timeoutMs);
  };

  disconnect = (peerId: string): Promise<void> => {
    if (peerId.trim() === "") return Promise.reject(new Error("p2p peer ID is required"));
    const id = crypto.randomUUID();
    return this.wait<void>(id, { type: "disconnect", id, peerId }, this.timeoutMs);
  };

  fetch = (peer: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    this.request(peer, input, init);

  request = async (peer: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = makeRequest(input, init);
    const url = new URL(request.url);
    if (url.hash !== "") throw new Error("p2p URL must not contain a fragment");
    const body = await readBodyLimited(request, this.maxBodyBytes);
    const headers = new Headers(request.headers);
    headers.delete("cookie");
    const id = crypto.randomUUID();
    const messageRequest: P2pHttpRequest = {
      id,
      ...(peer.trim().startsWith("/") ? { address: peer.trim() } : { peerId: peer.trim() }),
      method: request.method,
      target: url.pathname + url.search,
      headers: [...headers],
      body,
      timeoutMs: this.timeoutMs,
    };
    validateRequest(messageRequest, this.maxBodyBytes);
    return this.wait<Response>(id, { type: "request", request: messageRequest }, this.timeoutMs, request.signal);
  };

  close = async (): Promise<void> => {
    if (this.closed) return;
    this.closed = true;
    if (this.port !== undefined) {
      try {
        this.port.postMessage({ type: "detach" } satisfies P2pMessage);
      } catch {
        // The port may already have been reclaimed by the browser.
      }
      this.port.close();
    }
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.cleanup();
      pending.reject(new Error("p2p client closed"));
      this.pending.delete(id);
    }
    this.publish({ ...this.snapshot, status: "closed" });
  };

  private wait<T>(id: string, message: P2pMessage, timeoutMs: number, signal?: AbortSignal): Promise<T> {
    if (this.closed || this.port === undefined) return Promise.reject(new Error("p2p client is unavailable"));
    return new Promise<T>((resolve, reject) => {
      const finish = (action: () => void): void => {
        const pending = this.pending.get(id);
        if (pending === undefined) return;
        clearTimeout(pending.timer);
        pending.cleanup();
        this.pending.delete(id);
        action();
      };
      const cancel = (): void => {
        try {
          this.send({ type: "cancel", id });
        } catch {
          // The worker may already have gone away.
        }
      };
      const onAbort = (): void => {
        cancel();
        finish(() => reject(abortError()));
      };
      const timer = setTimeout(() => {
        cancel();
        finish(() => reject(new Error("p2p request timed out")));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => finish(() => resolve(value as T)),
        reject: (error) => finish(() => reject(error)),
        timer,
        cleanup: () => signal?.removeEventListener("abort", onAbort),
      });
      if (signal?.aborted) {
        onAbort();
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        this.send(message);
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error(String(error))));
      }
    });
  }

  private send(message: P2pMessage): void {
    if (this.port === undefined || this.closed) throw new Error("p2p client is unavailable");
    const transfer = message.type === "request" ? [message.request.body.buffer] : [];
    this.port.postMessage(message, transfer);
  }

  private receive(message: P2pMessage): void {
    if (message.type === "snapshot") {
      this.publish(message.snapshot);
      return;
    }
    if (message.type === "response") {
      validateMessageId(message.response.id);
      const response = new Response(
        message.response.body.byteLength === 0 ? null : (message.response.body as unknown as BodyInit),
        {
          headers: new Headers([...message.response.headers] as [string, string][]),
          status: message.response.status,
          statusText: message.response.statusText,
        },
      );
      this.pending.get(message.response.id)?.resolve(response);
      return;
    }
    if (message.type === "result") {
      validateMessageId(message.id);
      this.pending.get(message.id)?.resolve(undefined);
      return;
    }
    if (message.type === "error") {
      const pending = message.id === undefined ? undefined : this.pending.get(message.id);
      if (pending !== undefined) pending.reject(new Error(message.error));
      else this.publish({ ...this.snapshot, status: "error", error: message.error });
    }
  }

  private publish(snapshot: P2pSnapshot): void {
    this.snapshot = freeze(snapshot);
    for (const listener of [...this.listeners]) listener();
  }
}

async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array> {
  if (request.body === null) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return concat(chunks, length);
      length += value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new Error("request body exceeds maximum");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

function makeRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request) return new Request(input, init);
  return new Request(new URL(input.toString(), "https://p2p.invalid"), init);
}

function freeze(snapshot: P2pSnapshot): P2pSnapshot {
  return Object.freeze({
    ...snapshot,
    peers: Object.freeze(snapshot.peers.map((peer) => Object.freeze({ ...peer, addresses: Object.freeze([...peer.addresses]), protocols: Object.freeze([...peer.protocols]) }))),
  });
}

function abortError(): Error {
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}

export interface MtmP2pClientConfig extends P2pClientOptions {}

export function apply(ctx: ClientContext, config: MtmP2pClientConfig = {}): void {
  const client = new MtmP2pClient(config);
  ctx.provide("mtm-p2p-client", client);
  ctx.effect(() => () => void client.close(), "mtm-p2p: client lifecycle");
}
