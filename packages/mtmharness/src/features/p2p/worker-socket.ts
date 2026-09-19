import {
  SOCKET_BUFFER_LIMIT,
  SOCKET_LEASE_MS,
  type SocketMessage,
} from "./socket.js";

interface BinarySocket extends EventTarget {
  readonly readyState: number;
  readonly bufferedAmount: number;
  send(data: ArrayBuffer): void;
  close(): void;
}

/** Own the network socket until its view closes, its port expires, or it fails. */
export function bridgeSocket(
  port: MessagePort,
  connect: (signal: AbortSignal) => Promise<BinarySocket>,
  disposed: () => void,
): () => void {
  const controller = new AbortController();
  let socket: BinarySocket | undefined;
  let closed = false;
  let opened = false;
  let pendingReceive = 0;
  let lastSeen = Date.now();
  const send = (message: SocketMessage, transfer: Transferable[] = []) => {
    try {
      port.postMessage(message, transfer);
    } catch {
      close("View port unavailable");
    }
  };
  const close = (reason = "") => {
    if (closed) return;
    closed = true;
    clearInterval(lease);
    // The patched official socket owns aborting its actual libp2p stream.
    controller.abort();
    if (socket?.readyState === 1) socket.close();
    port.onmessage = null;
    send({ type: "close", reason });
    port.close();
    disposed();
  };
  // ponytail: suspended/crashed tabs lose the stream after two minutes; use a
  // browser-supported port-lifetime signal if one becomes available.
  const lease = setInterval(() => {
    if (Date.now() - lastSeen >= SOCKET_LEASE_MS)
      close("View heartbeat expired");
  }, SOCKET_LEASE_MS / 4);
  port.onmessage = ({ data }: MessageEvent<SocketMessage>) => {
    if (closed) return;
    lastSeen = Date.now();
    if (data.type === "close") {
      close();
      return;
    }
    if (data.type === "ack") {
      if (
        !Number.isSafeInteger(data.bytes) ||
        data.bytes < 0 ||
        data.bytes > pendingReceive
      ) {
        close("Invalid receive acknowledgement");
        return;
      }
      pendingReceive -= data.bytes;
    } else if (data.type === "data") {
      if (
        !(data.data instanceof ArrayBuffer) ||
        socket?.readyState !== 1 ||
        data.data.byteLength + socket.bufferedAmount > SOCKET_BUFFER_LIMIT
      ) {
        close("Outgoing socket buffer exceeded or socket unavailable");
        return;
      }
      try {
        socket.send(data.data);
        send({ type: "ack", bytes: data.data.byteLength });
      } catch {
        close("Socket write failed");
      }
    }
  };
  port.onmessageerror = () => close("Invalid view message");
  port.start();
  void connect(controller.signal)
    .then((connected) => {
      socket = connected;
      if (closed) {
        if (socket.readyState === 1) socket.close();
        return;
      }
      const open = () => {
        if (opened || closed) return;
        opened = true;
        send({ type: "open" });
      };
      socket.addEventListener("open", open, { signal: controller.signal });
      socket.addEventListener(
        "message",
        (event) => {
          const data: unknown = (event as MessageEvent).data;
          if (
            !(data instanceof ArrayBuffer) ||
            data.byteLength + pendingReceive > SOCKET_BUFFER_LIMIT
          ) {
            close("Incoming desktop data exceeded transport buffer");
            return;
          }
          open();
          pendingReceive += data.byteLength;
          // Do not detach buffers potentially retained by the official parser.
          const copy = data.slice(0);
          send({ type: "data", data: copy }, [copy]);
        },
        { signal: controller.signal },
      );
      socket.addEventListener(
        "error",
        (event) =>
          close((event as ErrorEvent).message || "P2P data connection failed"),
        { signal: controller.signal },
      );
      socket.addEventListener("close", () => close(), {
        signal: controller.signal,
      });
      if (socket.readyState === 1) open();
      if (socket.readyState === 3)
        close("P2P data connection closed before opening");
    })
    .catch((error: unknown) =>
      close(error instanceof Error ? error.message : "P2P connection failed"),
    );
  return close;
}
