import { describe, expect, it } from "vitest";
import { apply, name } from "./index.ts";

describe("mtm-connect Host half", () => {
  it("provides the owner registry and serves snapshot/mutation RPCs", async () => {
    const provided: Record<string, unknown> = {};
    const cleanups: Array<() => void | Promise<void>> = [];
    let handler: ((endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) | undefined;
    const ctx = {
      connection: {
        rpc: {
          handle(_channel: string, next: (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<unknown>) {
            handler = next;
            return async () => { handler = undefined; };
          },
        },
      },
      provide(key: string, value: unknown) { provided[key] = value; },
      effect(effect: () => (() => void | Promise<void>) | void) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup);
        return cleanup;
      },
    };
    apply(ctx as never, { ownerId: "owner-1", seed: true });
    expect(name).toBe("mtm-connect");
    expect(provided.mtmConnect).toBeDefined();
    const service = provided.mtmConnect as { getSnapshot: () => { ownerId: string; revision: number; connections: readonly { instance: { id: string }; observation: { status: string } }[] } };
    expect(service.getSnapshot()).toMatchObject({ ownerId: "owner-1", revision: 0 });
    expect(service.getSnapshot().connections).toHaveLength(2);
    expect(handler).toBeTypeOf("function");

    const signal = new AbortController().signal;
    const snapshotResponse = await handler!("request", { args: { kind: "snapshot" } }, signal) as { ok: boolean; value: { ownerId: string } };
    expect(snapshotResponse).toMatchObject({ ok: true, value: { ownerId: "owner-1" } });
    const mutationResponse = await handler!("request", {
      args: { kind: "mutate", mutation: { type: "enable", connectionId: "mock-workstation" } },
    }, signal) as { ok: boolean; value: { snapshot: { revision: number } } };
    expect(mutationResponse).toMatchObject({ ok: true, value: { snapshot: { revision: 1 } } });
    expect(service.getSnapshot().connections[0]?.observation.status).toBe("online");

    for (const cleanup of cleanups.reverse()) await cleanup();
    expect(handler).toBeUndefined();
  });
});
