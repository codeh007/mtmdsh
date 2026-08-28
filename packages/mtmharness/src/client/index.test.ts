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
  const codingSettings = {
    status: "ready",
    value: {
      codebaseMemoryEnabled: false,
      codebaseMemoryAugmentHooks: true,
      modernGoEnabled: true,
      modernGoCommand: "",
      ponytailEnabled: true,
      ponytailMode: "full",
      ponytailSubagents: true,
      rtkMode: "auto",
      rtkAutoInstall: true,
      rtkCommand: "",
    },
    base: {},
    user: {},
    revision: 1,
    writable: true,
    mode: "host",
  };
  const ctx = {
    get(name: string) {
      if (name !== "connection") throw new Error("unexpected service: " + name);
      return { rpc: { call: async () => ({ ok: true, value: snapshot }) } };
    },
    provide() {},
    locale: {
      bind: () => (key: string) => key,
      register: () => () => {},
    },
    settingsScope: {
      bind: () => ({
        getSnapshot: () => codingSettings,
        subscribe: () => () => {},
        set: async () => {},
        unset: async () => {},
      }),
    },
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

async function hostBench(): Promise<{ provided: Record<string, unknown>; cleanups: Array<() => void | Promise<void>> }> {
  const provided: Record<string, unknown> = {};
  const cleanups: Array<() => void | Promise<void>> = [];
  const settings = {
    codebaseMemoryEnabled: false,
    codebaseMemoryAugmentHooks: true,
    modernGoEnabled: false,
    modernGoCommand: "",
    ponytailEnabled: false,
    ponytailMode: "full",
    ponytailSubagents: true,
    rtkMode: "auto",
    rtkAutoInstall: true,
    rtkCommand: "",
    serverName: "codebase_memory",
    command: "",
    args: [],
    cwd: "",
    env: {},
    cacheDir: "",
    allowedRoot: "",
    toolCallTimeoutMs: 60_000,
    hookTimeoutMs: 2_000,
    runtimeCheckTimeoutMs: 120_000,
    ensureRuntime: true,
    failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
  };
  const ctx = {
    connection: { rpc: { handle() { return async () => {}; } } },
    settings: {
      register() {
        return { get: () => settings, watch: () => () => {} };
      },
    },
    provide(key: string, value: unknown) { provided[key] = value; },
    effect(effect: () => (() => void | Promise<void>) | void) {
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return cleanup;
    },
  };
  await applyHost(ctx as never);
  return { provided, cleanups };
}

describe("mtmharness Host half", () => {
  it("assembles the Host-owned Connect control plane", async () => {
    const { provided, cleanups } = await hostBench();
    expect(provided.mtmConnect).toBeDefined();
    for (const cleanup of cleanups.reverse()) await cleanup();
  });

  it("fails clearly when the Host connection service is unavailable", async () => {
    await expect(applyHost({} as never)).rejects.toThrow("mtmharness: DSH connection service is unavailable");
  });
});

describe("mtmharness browser half", () => {
  it("declares the combined service dependencies", () => {
    expect(inject).toEqual(["slots", "connection", "locale", "settingsScope"]);
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

  it("registers the MTM Harness surface with Connect under one lifecycle", () => {
    const { registered, cleanups } = clientBench();
    expect(registered).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "sidebar.footer.action", options: expect.objectContaining({ id: "mtmharness", order: 10 }) }),
    ]));
    expect(registered.filter((entry) => entry.name === "sidebar.footer.action")).toHaveLength(2);
    expect(registered).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "sidebar.footer.action", options: expect.objectContaining({ id: "mtmdsh-launcher", order: 12 }) }),
      expect.objectContaining({ name: "shell.overlay", options: expect.objectContaining({ id: "mtmdsh-launcher-overlay", order: 100 }) }),
    ]));
    for (const cleanup of cleanups.reverse()) void cleanup();
    expect(registered).toHaveLength(0);
  });
});
