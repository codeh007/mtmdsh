import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { createLibp2p, type Libp2p } from "libp2p";
import type { P2pMessage, P2pSnapshot } from "./protocol.js";

const PROTOCOL = "/mtm-p2p/1";
const ports = new Set<MessagePort>();
let node: Libp2p | undefined;
const peers = new Map<
  string,
  { id: string; addresses: readonly string[]; status: "connected" }
>();

async function getNode(): Promise<Libp2p> {
  if (node) return node;
  node = await createLibp2p({
    transports: [webSockets()],
    connectionEncrypters: [noise()],
    streamMuxers: [yamux()],
  });
  await node.handle(PROTOCOL, async (stream) => {
    const io = stream as any;
    for await (const chunk of io.source) await io.sink([chunk]);
  });
  return node;
}
function publish(snapshot: P2pSnapshot): void {
  for (const port of ports)
    port.postMessage({ type: "snapshot", snapshot } satisfies P2pMessage);
}
async function handle(port: MessagePort, message: P2pMessage): Promise<void> {
  if (message.type !== "request") return;
  const { request } = message;
  try {
    const n = await getNode();
    const connection = await n.dial(request.peerId as any);
    const stream: any = await connection.newStream(PROTOCOL);
    await stream.sink([request.payload]);
    const first = await stream.source[Symbol.asyncIterator]().next();
    const payload = first.done ? new Uint8Array() : new Uint8Array(first.value);
    const peerId = request.peerId;
    peers.set(peerId, { id: peerId, addresses: [peerId], status: "connected" });
    port.postMessage(
      { type: "response", id: request.id, payload } satisfies P2pMessage,
      [payload.buffer],
    );
    publish({ status: "connected", peerId, peers: [...peers.values()] });
  } catch (error) {
    port.postMessage({
      type: "error",
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    } satisfies P2pMessage);
  }
}
(self as unknown as { onconnect: (event: MessageEvent) => void }).onconnect = (
  event: MessageEvent,
) => {
  const port = (event as unknown as { ports: MessagePort[] }).ports[0]!;
  ports.add(port);
  port.onmessage = (input: MessageEvent<P2pMessage>) => {
    void handle(port, input.data);
  };
  port.start();
};
