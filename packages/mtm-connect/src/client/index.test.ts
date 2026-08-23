import { describe, expect, it } from "vitest";
import { createDemoRegistry } from "../core/registry.ts";
import { apply, inject } from "./index.ts";

interface Registered {
  readonly options: Record<string, unknown>;
  readonly component: unknown;
}

describe("mtm-connect browser half", () => {
  it("declares the connection dependency, hydrates Host state, and cleans up", async () => {
    const registered: Registered[] = [];
    const cleanups: Array<() => void | Promise<void>> = [];
    const provided: Record<string, unknown> = {};
    const snapshot = createDemoRegistry().getSnapshot();
    const calls: unknown[] = [];
    const ctx = {
      get(name: string) {
        if (name !== "connection") throw new Error("unexpected service: " + name);
        return {
          rpc: {
            call: async (channel: string, endpoint: string, payload: unknown) => {
              calls.push({ channel, endpoint, payload });
              return { ok: true, value: snapshot };
            },
          },
        };
      },
      provide(key: string, value: unknown) { provided[key] = value; },
      effect(effect: () => (() => void | Promise<void>) | void) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup);
        return cleanup;
      },
      slots: {
        inject(name: string, callback: () => () => void) {
          expect(name).toBe("sidebar.footer.action");
          cleanups.push(callback());
        },
        register(options: Record<string, unknown>, component: unknown) {
          const entry = { options, component };
          registered.push(entry);
          return () => {
            const index = registered.indexOf(entry);
            if (index >= 0) registered.splice(index, 1);
          };
        },
      },
    };
    expect(inject).toEqual(["slots", "connection"]);
    apply(ctx as never);
    expect(provided.mtmConnectClient).toBeDefined();
    expect(registered).toHaveLength(1);
    expect(registered[0]?.options).toMatchObject({ name: "sidebar.footer.action", id: "mtm-connect", order: 20 });
    await new Promise<void>((resolve) => { queueMicrotask(resolve); });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ channel: "/mtm-connect", endpoint: "request" });
    for (const cleanup of cleanups.reverse()) await cleanup();
    expect(registered).toHaveLength(0);
  });
});
