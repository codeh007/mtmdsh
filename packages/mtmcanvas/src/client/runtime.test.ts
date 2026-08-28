import { describe, expect, it } from "vitest";
import { createCanvasDocument } from "../contract/canvas.ts";
import { CanvasRuntime } from "./runtime.ts";

type Deferred<T> = { promise: Promise<T>; resolve(value: T): void; reject(error: unknown): void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function canvasResponse(name: string, version: string) {
  return { ok: true, value: { name, version, document: createCanvasDocument(name.replace(/\.canvas$/u, "")) } };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

function harness() {
  const pending: Array<{ payload: unknown; deferred: Deferred<unknown> }> = [];
  const rpc = {
    call: async (_channel: string, _endpoint: string, payload: unknown): Promise<unknown> => {
      const item = { payload, deferred: deferred<unknown>() };
      pending.push(item);
      return item.deferred.promise;
    },
  };
  return { pending, rpc };
}

describe("CanvasRuntime", () => {
  it("keeps the latest opened file when responses arrive out of order", async () => {
    const { pending, rpc } = harness();
    const runtime = new CanvasRuntime(rpc as never);
    pending[0]?.deferred.resolve({ ok: true, value: [] });
    await settle();

    runtime.open("a.canvas");
    runtime.open("b.canvas");
    pending[2]?.deferred.resolve(canvasResponse("b.canvas", "v2"));
    pending[1]?.deferred.resolve(canvasResponse("a.canvas", "v1"));
    await settle();

    expect(runtime.getSnapshot().name).toBe("b.canvas");
    runtime.dispose();
  });

  it("preserves local edits and exposes a conflict after a stale save", async () => {
    const { pending, rpc } = harness();
    const runtime = new CanvasRuntime(rpc as never);
    pending[0]?.deferred.resolve({ ok: true, value: [] });
    await settle();

    runtime.open("demo.canvas");
    pending[1]?.deferred.resolve(canvasResponse("demo.canvas", "v1"));
    await settle();
    runtime.updatePrompt("prompt-1", "local edit");
    runtime.save();
    pending[2]?.deferred.resolve({ ok: false, error: { code: "FS_STALE_VERSION", message: "file changed since it was read" } });
    await settle();

    expect(runtime.getSnapshot()).toMatchObject({ name: "demo.canvas", conflict: true, error: "file changed since it was read" });
    expect(runtime.getSnapshot().document?.nodes[0]?.prompt).toBe("local edit");
    runtime.dispose();
  });
});
