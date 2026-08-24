import { describe, expect, it } from "vitest";
import { createDemoRegistry } from "../features/connect/core/registry.ts";
import { apply as applyHost } from "../index.ts";
import { apply, inject } from "./index.ts";

type Registered = {
  name: string;
  options: Record<string, unknown>;
  component: unknown;
};

function clientBench(): { registered: Registered[]; cleanups: Array<() => void | Promise<void>> } {
  const registered: Registered[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];
  const snapshot = createDemoRegistry().getSnapshot();
  const ctx = {
    get(name: string) {
      if (name !== "connection") throw new Error("unexpected service: " + name);
      return { rpc: { call: async () => ({ ok: true, value: snapshot }) } };
    },
    provide() {},
    effect(effect: () => (() => void | Promise<void>) | void) {
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return cleanup;
    },
    sessions: {
      provide() {
        return () => {};
      },
    },
    slots: {
      inject(_name: string, callback: () => () => void) {
        const cleanup = callback();
        cleanups.push(cleanup);
        return cleanup;
      },
      register(options: Record<string, unknown>, component: unknown) {
        const entry = { name: String(options.name), options, component };
        registered.push(entry);
        return () => {
          const index = registered.indexOf(entry);
          if (index >= 0) registered.splice(index, 1);
        };
      },
    },
  };
  apply(ctx as never);
  return { registered, cleanups };
}

function hostBench(): { provided: Record<string, unknown>; cleanups: Array<() => void | Promise<void>> } {
  const provided: Record<string, unknown> = {};
  const cleanups: Array<() => void | Promise<void>> = [];
  const ctx = {
    connection: { rpc: { handle() { return async () => {}; } } },
    provide(key: string, value: unknown) { provided[key] = value; },
    effect(effect: () => (() => void | Promise<void>) | void) {
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return cleanup;
    },
  };
  applyHost(ctx as never);
  return { provided, cleanups };
}

describe("mtmharness Host half", () => {
  it("assembles the Host-owned Connect control plane", async () => {
    const { provided, cleanups } = hostBench();
    expect(provided.mtmConnect).toBeDefined();
    for (const cleanup of cleanups.reverse()) await cleanup();
  });

  it("fails clearly when the Host connection service is unavailable", () => {
    expect(() => applyHost({} as never)).toThrow("mtmharness: DSH connection service is unavailable");
  });
});

describe("mtmharness browser half", () => {
  it("declares the combined service dependencies", () => {
    expect(inject).toEqual(["slots", "sessions", "connection"]);
  });

  it("fails clearly when the Client connection service is unavailable", () => {
    const cleanups: Array<() => void | Promise<void>> = [];
    const ctx = {
      get(name: string) {
        if (name === "connection") return undefined;
        throw new Error("unexpected service: " + name);
      },
      provide() {},
      effect(effect: () => (() => void | Promise<void>) | void) {
        const cleanup = effect();
        if (typeof cleanup === "function") cleanups.push(cleanup);
        return cleanup;
      },
      sessions: { provide() { return () => {}; } },
      slots: {
        inject(_name: string, callback: () => () => void) {
          const cleanup = callback();
          cleanups.push(cleanup);
          return cleanup;
        },
        register() { return () => {}; },
      },
    };
    expect(() => apply(ctx as never)).toThrow("mtmharness: DSH connection service is unavailable");
    for (const cleanup of cleanups.reverse()) void cleanup();
  });

  it("registers Connect and MTM Harness surfaces under one lifecycle", () => {
    const { registered, cleanups } = clientBench();
    expect(registered).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "sidebar.footer.action", options: expect.objectContaining({ id: "mtm-connect", order: 20 }) }),
      expect.objectContaining({ name: "sidebar.footer.action", options: expect.objectContaining({ id: "mtmharness", order: 10 }) }),
    ]));
    for (const cleanup of cleanups.reverse()) void cleanup();
    expect(registered).toHaveLength(0);
  });
});
