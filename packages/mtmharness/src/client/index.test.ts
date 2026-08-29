import { describe, expect, it } from "vitest";
import { apply as applyHost } from "../index.ts";
import { apply, inject } from "./index.ts";

type Registered = {
  name: string;
  options: Record<string, unknown>;
  component: unknown;
};

function clientBench(loopback = true): { registered: Registered[]; cleanups: Array<() => void | Promise<void>> } {
  const registered: Registered[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];
  const codingSettings = {
    status: "ready",
    value: {
      codebaseMemoryEnabled: false,
      dynamicCanvasEnabled: false,
      codebaseMemoryAugmentHooks: true,
      modernGoEnabled: true,
      ponytailEnabled: true,
      ponytailMode: "full",
      ponytailSubagents: true,
      rtkMode: "auto",
    },
    base: {},
    user: {},
    revision: 1,
    writable: true,
    mode: "host",
  };
  const connectSettings = {
    status: "ready",
    value: { enabled: false },
    base: {},
    user: {},
    revision: 1,
    writable: true,
    mode: "host",
  };
  const ctx = {
    get(name: string) {
      if (name === "connection") return { isLoopback: loopback, rpc: { call: async () => ({ ok: true, value: {} }) } };
      throw new Error("unexpected service: " + name);
    },
    provide() {},
    locale: {
      bind: () => (key: string) => key,
      register: () => () => {},
    },
    settingsScope: {
      bind: (spec: { namespace: string }) => spec.namespace === "mtm-connect" ? {
        getSnapshot: () => connectSettings,
        subscribe: () => () => {},
        set: async () => {},
        unset: async () => {},
      } : {
        getSnapshot: () => codingSettings,
        subscribe: () => () => {},
        set: async () => {},
        unset: async () => {},
      },
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

async function hostBench(): Promise<{ registeredNamespaces: string[]; cleanups: Array<() => void | Promise<void>> }> {
  const registeredNamespaces: string[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];
  const settings = {
    codebaseMemoryEnabled: false,
    dynamicCanvasEnabled: false,
    codebaseMemoryAugmentHooks: true,
    modernGoEnabled: false,
    ponytailEnabled: false,
    ponytailMode: "full",
    ponytailSubagents: true,
    rtkMode: "auto",
    serverName: "codebase_memory",
    command: "",
    args: [],
    cwd: "",
    env: {},
    cacheDir: "",
    allowedRoot: "",
    toolCallTimeoutMs: 60_000,
    hookTimeoutMs: 2_000,
    failOnStartupError: false,
    reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
  };
  const ctx = {
    connection: { rpc: { handle() { return async () => {}; } } },
    settings: {
      register(namespace: unknown) {
        registeredNamespaces.push(String(namespace));
        return { get: () => settings, watch: () => () => {} };
      },
    },
    effect(effect: () => (() => void | Promise<void>) | void) {
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return cleanup;
    },
  };
  await applyHost(ctx as never);
  return { registeredNamespaces, cleanups };
}

describe("mtmharness Host half", () => {
  it("registers the Connect settings namespace without a local backend", async () => {
    const { registeredNamespaces, cleanups } = await hostBench();
    expect(registeredNamespaces).toContain("mtm-connect");
    for (const cleanup of cleanups.reverse()) await cleanup();
  });

});

describe("mtmharness browser half", () => {
  it("declares the combined service dependencies", () => {
    expect(inject).toEqual(["slots", "locale", "settingsScope"]);
  });

  it("only exposes update actions for loopback connections", () => {
    const local = clientBench(true);
    const localCard = local.registered.find((entry) => entry.options.key === "mtm-coding");
    const localFace = (localCard?.options.inject as (() => { hooks: { mtmCodingCard: { getSnapshot: () => { update: { available: boolean } } } } }) | undefined)?.();
    expect(localFace?.hooks.mtmCodingCard.getSnapshot().update.available).toBe(true);
    for (const cleanup of local.cleanups.reverse()) void cleanup();

    const remote = clientBench(false);
    const remoteCard = remote.registered.find((entry) => entry.options.key === "mtm-coding");
    const remoteFace = (remoteCard?.options.inject as (() => { hooks: { mtmCodingCard: { getSnapshot: () => { update: { available: boolean } } } } }) | undefined)?.();
    expect(remoteFace?.hooks.mtmCodingCard.getSnapshot().update.available).toBe(false);
    for (const cleanup of remote.cleanups.reverse()) void cleanup();
  });

  it("keeps configuration actions out of the sidebar footer", () => {
    const { registered, cleanups } = clientBench();
    expect(registered).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "settings.plugin.item", options: expect.objectContaining({ key: "mtm-coding" }) }),
      expect.objectContaining({ name: "settings.plugin.item", options: expect.objectContaining({ key: "mtm-connect" }) }),
    ]));
    expect(registered.filter((entry) => entry.name === "sidebar.footer.action")).toHaveLength(0);
    expect(registered.filter((entry) => entry.name === "shell.overlay")).toHaveLength(0);
    for (const cleanup of cleanups.reverse()) void cleanup();
    expect(registered).toHaveLength(0);
  });
});
