import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { http } from "@libp2p/http";
import { multiaddr } from "@multiformats/multiaddr";

// Mock only the libp2p stream boundary; HTTP upgrade and WebSocket framing are real.
class PeerStream extends EventTarget {
  incoming = new PassThrough({ objectMode: true });
  sent = [];
  closes = 0;
  aborts = [];
  writable = true;
  drain = Promise.withResolvers();

  constructor() {
    super();
    this.incoming.on("error", () => {});
  }

  send(data) {
    this.sent.push(Uint8Array.from(data.subarray()));
    return this.writable;
  }

  async onDrain({ signal }) {
    signal.throwIfAborted();
    const aborted = Promise.withResolvers();
    const onAbort = () => aborted.reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      await Promise.race([this.drain.promise, aborted.promise]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  [Symbol.asyncIterator]() {
    return this.incoming[Symbol.asyncIterator]();
  }

  async close() {
    this.closes++;
    this.incoming.end();
  }

  abort(error) {
    this.aborts.push(error);
    this.incoming.destroy(error);
  }
}

const endpoint = multiaddr(
  "/ip4/127.0.0.1/tcp/1234/http-path/vnc%3Fgeneration%3Dtest%26instance%3Ddesktop",
);
const event = (target, type) =>
  new Promise((resolve) =>
    target.addEventListener(type, resolve, { once: true }),
  );

async function connect(init = {}, dial) {
  const stream = new PeerStream();
  let dialSignal;
  const service = http()({
    logger: {
      forComponent: () => Object.assign(() => {}, { error() {}, trace() {} }),
    },
    connectionManager: {
      async openStream(_addresses, protocol, options) {
        assert.equal(protocol, "/http/1.1");
        dialSignal = options.signal;
        return dial ? dial(stream, options.signal) : stream;
      },
    },
  });
  const socket = await service.connect(endpoint, init);
  return { socket, stream, signal: () => dialSignal };
}

async function open(connection) {
  const opened = event(connection.socket, "open");
  await setImmediate();
  assert.match(
    new TextDecoder().decode(connection.stream.sent[0]),
    /^GET \/vnc\?generation=test&instance=desktop HTTP\/1.1\r\n/,
  );
  connection.stream.dispatchEvent(
    new MessageEvent("message", {
      data: new TextEncoder().encode(
        "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
      ),
    }),
  );
  await opened;
}

function closeFrame(stream) {
  const frame = stream.sent.at(-1);
  assert.equal(frame[0], 0x88, "FIN + close opcode");
  assert.equal(frame[1], 0x80, "client close frame is masked and empty");
  assert.equal(frame.length, 6);
}

test("caller abort cancels connecting and releases a late dial result", {
  timeout: 2000,
}, async () => {
  const controller = new AbortController();
  const dial = Promise.withResolvers();
  const c = await connect({ signal: controller.signal }, () => dial.promise);
  const closed = event(c.socket, "close");
  let errors = 0;
  c.socket.onerror = () => errors++;
  controller.abort(new Error("cancelled"));
  assert.equal(c.signal().aborted, true);
  await closed;
  dial.resolve(c.stream);
  await setImmediate();
  assert.equal(c.socket.readyState, c.socket.CLOSED);
  assert.equal(c.stream.aborts.length, 1);
  assert.equal(c.stream.sent.length, 0);
  assert.equal(errors, 1);
});

test("caller abort while waiting for upgrade response aborts the acquired stream", {
  timeout: 2000,
}, async () => {
  const controller = new AbortController();
  const c = await connect({ signal: controller.signal });
  await setImmediate();
  const closed = event(c.socket, "close");
  controller.abort(new Error("cancel handshake"));
  await closed;
  assert.equal(c.stream.aborts.length, 1);
  assert.equal(c.socket.readyState, c.socket.CLOSED);
});

test("close during handshake is idempotent and never opens afterwards", {
  timeout: 2000,
}, async () => {
  const c = await connect();
  const closed = event(c.socket, "close");
  let opens = 0;
  c.socket.onopen = () => opens++;
  c.socket.close();
  c.socket.close();
  await closed;
  await setImmediate();
  assert.equal(c.signal().aborted, true);
  assert.equal(c.stream.aborts.length, 1);
  assert.equal(opens, 0);
});

test("local close sends a masked close frame and releases the stream once", {
  timeout: 2000,
}, async () => {
  const c = await connect();
  await open(c);
  const closed = event(c.socket, "close");
  let closes = 0;
  c.socket.addEventListener("close", () => closes++);
  c.socket.close();
  c.socket.close();
  await closed;
  await setImmediate();
  closeFrame(c.stream);
  assert.equal(c.stream.closes, 1);
  assert.equal(c.socket.readyState, c.socket.CLOSED);
  assert.equal(closes, 1);
});

test("remote close frame is acknowledged and remote EOF also closes", {
  timeout: 2000,
}, async () => {
  for (const frame of [true, false]) {
    const c = await connect();
    await open(c);
    const closed = event(c.socket, "close");
    if (frame) c.stream.incoming.write(Uint8Array.of(0x88, 0));
    else c.stream.incoming.end();
    await closed;
    if (frame) closeFrame(c.stream);
    assert.equal(c.stream.closes, 1);
    assert.equal(c.socket.readyState, c.socket.CLOSED);
  }
});

test("stream errors and caller abort after open emit error then close and release transport", {
  timeout: 2000,
}, async () => {
  for (const callerAbort of [false, true]) {
    const controller = new AbortController();
    const c = await connect({ signal: controller.signal });
    await open(c);
    const events = [];
    c.socket.onerror = () => {
      events.push("error");
      c.socket.close();
    };
    c.socket.onclose = () => events.push("close");
    const closed = event(c.socket, "close");
    if (callerAbort) controller.abort(new Error("caller abort"));
    else c.stream.incoming.destroy(new Error("remote reset"));
    await closed;
    assert.deepEqual(events, ["error", "close"]);
    assert.equal(c.stream.aborts.length, 1);
    assert.equal(c.socket.readyState, c.socket.CLOSED);
  }
});

test("event properties replace and clear handlers without removing addEventListener listeners", {
  timeout: 2000,
}, async () => {
  const c = await connect();
  for (const type of ["open", "message", "error", "close"]) {
    const calls = [];
    c.socket[`on${type}`] = () => calls.push("old");
    c.socket[`on${type}`] = () => calls.push("new");
    c.socket.addEventListener(type, () => calls.push("listener"));
    c.socket.dispatchEvent(new Event(type));
    assert.deepEqual(calls, ["new", "listener"]);
    c.socket[`on${type}`] = null;
    c.socket.dispatchEvent(new Event(type));
    assert.deepEqual(calls, ["new", "listener", "listener"]);
    assert.equal(c.socket[`on${type}`], null);
  }
  c.socket.close();
});

test("send and close preserve backpressure until onDrain completes", {
  timeout: 2000,
}, async () => {
  const c = await connect();
  await open(c);
  c.stream.writable = false;
  c.socket.send(Uint8Array.of(1, 2, 3));
  assert.equal(c.socket.bufferedAmount, 9);
  const closed = event(c.socket, "close");
  c.socket.close();
  assert.equal(c.socket.readyState, c.socket.CLOSING);
  assert.equal(c.stream.closes, 0);
  assert.equal(c.socket.bufferedAmount, 15);
  c.stream.drain.resolve();
  await closed;
  assert.equal(c.socket.bufferedAmount, 0);
  assert.equal(c.stream.closes, 1);
  closeFrame(c.stream);
});

test("failed drain aborts the stream and emits close", {
  timeout: 2000,
}, async () => {
  const c = await connect();
  await open(c);
  c.stream.writable = false;
  const closed = event(c.socket, "close");
  c.socket.send(Uint8Array.of(1));
  c.stream.drain.reject(new Error("drain failed"));
  await closed;
  assert.equal(c.socket.bufferedAmount, 0);
  assert.equal(c.stream.aborts.length, 1);
});
