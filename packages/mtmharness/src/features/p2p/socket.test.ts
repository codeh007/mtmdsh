// @vitest-environment node
import { MessageChannel } from "node:worker_threads";
import { afterAll, describe, expect, it, vi } from "vitest";
import { P2pSocket, SOCKET_BUFFER_LIMIT } from "./socket.js";
import { bridgeSocket } from "./worker-socket.js";

vi.stubGlobal(
  "CloseEvent",
  class extends Event {
    constructor(type: string, init: CloseEventInit) {
      super(type);
      Object.assign(this, init);
    }
  },
);
afterAll(() => vi.unstubAllGlobals());

class NetworkSocket extends EventTarget {
  readyState = 1;
  bufferedAmount = 0;
  sent: ArrayBuffer[] = [];
  send(data: ArrayBuffer): void {
    this.sent.push(data);
    this.dispatchEvent(new Event("sent"));
  }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

const event = (target: EventTarget, type: string) =>
  new Promise<Event>((resolve) =>
    target.addEventListener(type, resolve, { once: true }),
  );

describe("P2P binary channel", () => {
  it("copies reused RFB buffers, receives bytes and releases the owned stream", async () => {
    const channel = new MessageChannel();
    const network = new NetworkSocket();
    let disposed = false;
    let signal: AbortSignal | undefined;
    const socket = new P2pSocket(
      channel.port1 as unknown as MessagePort,
      () => {},
    );
    const opened = event(socket, "open");
    bridgeSocket(
      channel.port2 as unknown as MessagePort,
      async (value) => {
        signal = value;
        return network;
      },
      () => {
        disposed = true;
      },
    );
    await opened;
    try {
      const bytes = new Uint8Array([9, 1, 2, 8]);
      const sent = event(network, "sent");
      socket.send(bytes.subarray(1, 3));
      bytes.fill(7);
      await sent;
      expect([...new Uint8Array(network.sent[0])]).toEqual([1, 2]);
      expect(bytes.byteLength).toBe(4);
      const received = event(socket, "message");
      network.dispatchEvent(
        new MessageEvent("message", { data: new Uint8Array([3, 4]).buffer }),
      );
      expect([
        ...new Uint8Array(((await received) as MessageEvent<ArrayBuffer>).data),
      ]).toEqual([3, 4]);
      const closed = event(network, "close");
      socket.close();
      await closed;
      expect(signal?.aborted).toBe(true);
      expect(disposed).toBe(true);
    } finally {
      socket.close();
      channel.port2.close();
    }
  });

  it("cancels an in-flight handshake and bounds a stalled receiver", async () => {
    const channel = new MessageChannel();
    const socket = new P2pSocket(
      channel.port1 as unknown as MessagePort,
      () => {},
    );
    let aborted!: () => void;
    const abort = new Promise<void>((resolve) => {
      aborted = resolve;
    });
    bridgeSocket(
      channel.port2 as unknown as MessagePort,
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted();
              reject(signal.reason);
            },
            { once: true },
          );
        }),
      () => {},
    );
    socket.close();
    await abort;
    expect(socket.readyState).toBe(3);

    const next = new MessageChannel();
    const network = new NetworkSocket();
    const bounded = new P2pSocket(
      next.port1 as unknown as MessagePort,
      () => {},
    );
    const opened = event(bounded, "open");
    bridgeSocket(
      next.port2 as unknown as MessagePort,
      async () => network,
      () => {},
    );
    await opened;
    const closed = event(bounded, "close");
    network.bufferedAmount = SOCKET_BUFFER_LIMIT;
    bounded.send(new Uint8Array([1]));
    await closed;
    expect(network.sent).toHaveLength(0);
    expect(network.readyState).toBe(3);
    bounded.close();
  });
});
