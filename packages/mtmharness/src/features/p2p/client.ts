import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { loadStorage } from "./storage.ts";
import {
  DEFAULT_TIMEOUT_MS,
  MAX_PAYLOAD_BYTES,
  type P2pMessage,
  type P2pSnapshot,
  type Request,
  validateMessageId,
  validateRequest,
} from "./protocol.ts";
export * from "./protocol.ts";
export interface P2pClientOptions {
  readonly worker?: SharedWorker;
  readonly workerUrl?: string;
  readonly maxPayloadBytes?: number;
  readonly timeoutMs?: number;
}
const initial: P2pSnapshot = { status: "idle", peers: [] };
export class MtmP2pClient {
  private snapshot = freeze(initial);
  private readonly listeners = new Set<() => void>();
  private port?: MessagePort;
  private readonly pending = new Map<
    string,
    {
      resolve: (v: Uint8Array) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly max: number;
  private readonly timeout: number;
  constructor(options: P2pClientOptions = {}) {
    this.max = options.maxPayloadBytes ?? MAX_PAYLOAD_BYTES;
    this.timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    void loadStorage();
    const worker =
      options.worker ??
      (options.workerUrl && typeof SharedWorker !== "undefined"
        ? new SharedWorker(options.workerUrl, { type: "module" })
        : undefined);
    if (worker) {
      this.port = worker.port;
      this.port.onmessage = (e: MessageEvent<P2pMessage>) =>
        this.receive(e.data);
      this.port.start();
    }
  }
  getSnapshot = (): P2pSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  connect = async (address: string): Promise<void> => {
    if (!address) throw new Error("address is required");
    this.publish({ ...this.snapshot, status: "connecting" });
    this.publish({ ...this.snapshot, status: "connected" });
  };
  dial = this.connect;
  close = async (): Promise<void> => {
    this.publish({ ...this.snapshot, status: "closed" });
    this.port?.close();
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new Error("client closed"));
    }
    this.pending.clear();
  };
  request = ({
    id = crypto.randomUUID(),
    peerId,
    payload,
    timeoutMs,
  }: Omit<Request, "id"> & { id?: string }): Promise<Uint8Array> => {
    const request = { id, peerId, payload, timeoutMs };
    validateRequest(request, this.max);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("request timed out"));
      }, timeoutMs ?? this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ type: "request", request });
    });
  };
  private send(message: P2pMessage): void {
    if (!this.port) {
      if (message.type === "request")
        queueMicrotask(() =>
          this.receive({
            type: "response",
            id: message.request.id,
            payload: message.request.payload,
          }),
        );
      return;
    }
    this.port.postMessage(
      message,
      message.type === "request" ? [message.request.payload.buffer] : [],
    );
  }
  private receive(message: P2pMessage): void {
    if (message.type === "snapshot") this.publish(message.snapshot);
    else if (message.type === "response") {
      validateMessageId(message.id);
      const pending = this.pending.get(message.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        pending.resolve(message.payload);
      }
    } else if (message.type === "error") {
      const pending = message.id ? this.pending.get(message.id) : undefined;
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(message.id!);
        pending.reject(new Error(message.error));
      } else
        this.publish({
          ...this.snapshot,
          status: "error",
          error: message.error,
        });
    }
  }
  private publish(snapshot: P2pSnapshot): void {
    this.snapshot = freeze(snapshot);
    for (const listener of [...this.listeners]) listener();
  }
}

function freeze(value: P2pSnapshot): P2pSnapshot {
  return Object.freeze({ ...value, peers: Object.freeze([...value.peers]) });
}

export interface MtmP2pClientConfig extends P2pClientOptions {}

export function apply(ctx: ClientContext, config: MtmP2pClientConfig = {}): void {
  const client = new MtmP2pClient(config);
  ctx.provide("mtm-p2p-client", client);
  ctx.effect(() => async () => { await client.close(); }, "mtm-p2p: client lifecycle");
}
