import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { createRequire } from "node:module";
import test, { beforeEach } from "node:test";
import { setImmediate as nextTurn } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import "@libp2p/http";
import { multiaddr } from "@multiformats/multiaddr";

// Load the official browser implementation used by Vite, without replacing any
// fetch, framing, parser, middleware, or Response functions.
const { HTTP } = await import(
  new URL("./http.browser.js", import.meta.resolve("@libp2p/http"))
);
const { fetch: streamFetch } = await import(
  pathToFileURL(
    createRequire(import.meta.resolve("@libp2p/http")).resolve(
      "@libp2p/http-fetch",
    ),
  )
);
const log = Object.assign(() => {}, {
  newScope: () => log,
  error: () => {},
  trace: () => {},
});

class Stream extends EventTarget {
  log = log;
  sent = Promise.withResolvers();
  request = "";
  resets = [];
  async close() {}
  send(data) {
    this.request += new TextDecoder().decode(data);
    this.sent.resolve();
    return true;
  }
  abort(error) {
    if (this.resets.length > 0) return;
    this.resets.push(error);
    this.dispatchEvent(Object.assign(new Event("close"), { error }));
  }
  receive(text) {
    this.dispatchEvent(
      new MessageEvent("message", { data: new TextEncoder().encode(text) }),
    );
  }
}

function request(path = "/api/vnc/start", init = {}) {
  const stream = new Stream();
  const controller = new AbortController();
  const http = new HTTP({
    logger: { forComponent: () => log },
    registrar: {},
    connectionManager: {
      async openConnection() {
        return {
          async newStream() {
            return stream;
          },
        };
      },
    },
  });
  const address = multiaddr(
    `/ip4/127.0.0.1/tcp/1234/http-path/${encodeURIComponent(path.slice(1))}`,
  );
  const response = http.fetch(address, {
    method: "POST",
    signal: controller.signal,
    ...init,
  });
  return { stream, controller, response };
}

function cleaned(stream, controller) {
  for (const event of ["message", "remoteCloseWrite", "close"]) {
    assert.equal(
      getEventListeners(stream, event).length,
      0,
      `${event} listeners released`,
    );
  }
  assert.equal(
    getEventListeners(controller.signal, "abort").length,
    0,
    "abort listener released",
  );
}

const options = { timeout: 1000 };

test(
  "official stream fetch preserves percent-encoded query values",
  options,
  async () => {
    const stream = new Stream();
    const controller = new AbortController();
    const response = streamFetch(stream, "http://peer/api?token=a%26b%2Fc", {
      signal: controller.signal,
    });
    await stream.sent.promise;
    assert.equal(
      stream.request.split("\r\n")[0],
      "GET /api?token=a%26b%2Fc HTTP/1.1",
    );
    stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
    assert.equal(await (await response).text(), "");
    cleaned(stream, controller);
  },
);

test(
  "already aborted signal resets the owned stream without sending",
  options,
  async () => {
    const stream = new Stream();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      streamFetch(stream, "http://peer/api", { signal: controller.signal }),
      { name: "AbortError" },
    );
    assert.equal(stream.request, "");
    assert.equal(stream.resets.length, 1);
    cleaned(stream, controller);
  },
);

for (const operation of ["send", "close"]) {
  test(
    `${operation} failure resets the owned stream and removes response listeners`,
    options,
    async () => {
      const stream = new Stream();
      const controller = new AbortController();
      const error = new Error(`${operation} failed`);
      stream[operation] = () => {
        throw error;
      };
      const response = streamFetch(stream, "http://peer/api", {
        signal: controller.signal,
      });
      const rejected = assert.rejects(response, error);
      if (operation === "close") {
        await stream.sent.promise;
        stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n");
      }
      await rejected;
      assert.deepEqual(stream.resets, [error]);
      cleaned(stream, controller);
    },
  );
}

// Keep a mocked pending stream alive long enough for node:test's deadline.
beforeEach((t) => {
  const timer = setTimeout(() => {}, 1100);
  t.after(() => clearTimeout(timer));
});

test(
  "caller abort while awaiting headers rejects fetch and resets the stream",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    const error = new DOMException("cancel startup", "AbortError");
    const rejected = assert.rejects(response, error);
    controller.abort(error);
    await rejected;
    assert.deepEqual(stream.resets, [error]);
    cleaned(stream, controller);
  },
);

test(
  "caller abort after headers rejects a pending body read and resets the stream",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n");
    const reader = (await response).body.getReader();
    const error = new DOMException("unmount", "AbortError");
    const rejected = assert.rejects(reader.read(), error);
    controller.abort(error);
    await rejected;
    assert.deepEqual(stream.resets, [error]);
    cleaned(stream, controller);
  },
);

test(
  "request preserves query parameters in the HTTP target",
  options,
  async () => {
    const { stream, controller, response } = request(
      "/api/vnc/start?mode=shared&token=abc&x=1&x=2",
    );
    await stream.sent.promise;
    assert.equal(
      stream.request.split("\r\n")[0],
      "POST /api/vnc/start?mode=shared&token=abc&x=1&x=2 HTTP/1.1",
    );
    stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n");
    assert.equal(await (await response).text(), "");
    cleaned(stream, controller);
  },
);

for (const [name, chunks, eof] of [
  [
    "content length",
    ["HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhe", "llo"],
    false,
  ],
  [
    "chunked",
    [
      "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n2\r\nhe\r\n",
      "3\r\nllo\r\n0\r\n\r\n",
    ],
    false,
  ],
  ["EOF delimited", ["HTTP/1.1 200 OK\r\n\r\nhello"], true],
]) {
  test(
    `normal ${name} body finishes and releases listeners`,
    options,
    async () => {
      const { stream, controller, response } = request();
      await stream.sent.promise;
      for (const chunk of chunks) stream.receive(chunk);
      if (eof) stream.dispatchEvent(new Event("remoteCloseWrite"));
      assert.equal(await (await response).text(), "hello");
      cleaned(stream, controller);
      controller.abort();
      assert.deepEqual(stream.resets, []);
    },
  );
}

for (const event of ["remoteCloseWrite", "close"]) {
  test(
    `${event} before headers rejects fetch and releases listeners`,
    options,
    async () => {
      const { stream, controller, response } = request();
      await stream.sent.promise;
      const rejected = assert.rejects(response, /before headers/);
      stream.dispatchEvent(new Event(event));
      await rejected;
      cleaned(stream, controller);
    },
  );
}

test(
  "remote reset before headers rejects with the stream error",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    const error = new Error("remote reset");
    const rejected = assert.rejects(response, error);
    stream.dispatchEvent(Object.assign(new Event("close"), { error }));
    await rejected;
    cleaned(stream, controller);
  },
);

test(
  "body reader cancellation resets the stream and releases listeners",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\n");
    await (await response).body.cancel();
    await nextTurn();
    assert.equal(stream.resets.length, 1);
    cleaned(stream, controller);
  },
);

test(
  "abort with a queued unread body still errors the reader",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhello");
    const result = await response;
    controller.abort();
    await assert.rejects(result.text(), { name: "AbortError" });
    cleaned(stream, controller);
  },
);

test(
  "parser header limit remains enforced and releases listeners",
  options,
  async () => {
    const { stream, controller, response } = request("/bounded", {
      maxHeaderSize: 40,
    });
    await stream.sent.promise;
    const rejected = assert.rejects(response);
    stream.receive(`HTTP/1.1 200 OK\r\nX-Long: ${"a".repeat(100)}`);
    await rejected;
    assert.equal(stream.resets.length, 1);
    cleaned(stream, controller);
  },
);

test(
  "truncated content-length body rejects instead of hanging",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    stream.receive("HTTP/1.1 200 OK\r\nContent-Length: 10\r\n\r\nhi");
    const rejected = assert.rejects((await response).text());
    stream.dispatchEvent(new Event("remoteCloseWrite"));
    await rejected;
    cleaned(stream, controller);
  },
);

test(
  "null-body response finishes without retaining listeners",
  options,
  async () => {
    const { stream, controller, response } = request();
    await stream.sent.promise;
    stream.receive("HTTP/1.1 204 No Content\r\n\r\n");
    assert.equal((await response).body, null);
    await nextTurn();
    cleaned(stream, controller);
    assert.deepEqual(stream.resets, []);
  },
);
