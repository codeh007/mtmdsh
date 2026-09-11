import { Context } from "@deepseek-ai/cordis";
import { describe, expect, it } from "vitest";
import { apply as applyHost } from "../index.ts";
import { apply, inject } from "./index.ts";

type Registered = {
  name: string;
  options: Record<string, unknown>;
  component: unknown;
};

function clientBench(loopback = true): { registered: Registered[]; cleanups: Array<() => void | Promise<void>>; p2p: { getSnapshot: () => { status: string } } } {
  const registered: Registered[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];
  const services = new Map<string, unknown>();
  const codingSettings = {
    status: "ready",
    value: {
      codebaseMemoryEnabled: false,
      dynamicCanvasEnabled: false,
      codebaseMemoryAugmentHooks: true,
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
  const ctx = {
    get(name: string, strict = true) {
      if (strict && name.endsWith("-client")) return undefined;
      if (name === "connection") return { isLoopback: loopback, rpc: { call: async () => ({ ok: true, value: {} }) } };
      if (services.has(name)) return services.get(name);
      throw new Error("unexpected service: " + name);
    },
    provide(name: string, value: unknown) { services.set(name, value); },
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
  return { registered, cleanups, p2p: services.get("mtm-p2p-client") as { getSnapshot: () => { status: string } } };
}

async function hostBench(): Promise<{ registeredNamespaces: string[]; cleanups: Array<() => void | Promise<void>> }> {
  const registeredNamespaces: string[] = [];
  const cleanups: Array<() => void | Promise<void>> = [];
  const settings = {
    codebaseMemoryEnabled: false,
    dynamicCanvasEnabled: false,
    codebaseMemoryAugmentHooks: true,
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
    webServer: {},
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
    inject(_dependencies: readonly string[], callback: (context: unknown) => void) {
      callback(ctx);
    },
  };
  await applyHost(ctx as never);
  return { registeredNamespaces, cleanups };
}

describe("mtmharness Host half", () => {
  it("registers the Admin settings namespace without a local backend", async () => {
    const { registeredNamespaces, cleanups } = await hostBench();
    expect(registeredNamespaces).toContain("mtm-admin");
    for (const cleanup of cleanups.reverse()) await cleanup();
  });

});

describe("mtmharness browser half", () => {
  it("declares the combined service dependencies", () => {
    expect(inject).toEqual(["slots", "locale", "settingsScope", "connection"]);
  });

  it("waits for connection before the direct client entry runs", async () => {
    const root = new Context();
    for (const service of ["slots", "locale", "settingsScope"]) root.provide(service, {});
    let seen: unknown;
    const consumer = {
      inject,
      apply(ctx: { get(name: string): unknown }) { seen = ctx.get("connection"); },
    };
    const provider = {
      apply(ctx: { provide(name: string, value: unknown): void }) { ctx.provide("connection", {}); },
    };
    const [consumerFiber, providerFiber] = await Promise.all([root.plugin(consumer), root.plugin(provider)]);
    expect(seen).toBeDefined();
    await Promise.all([consumerFiber.dispose(), providerFiber.dispose()]);
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
    const { registered, cleanups, p2p } = clientBench();
    expect(registered).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "settings.plugin.item", options: expect.objectContaining({ key: "mtm-coding" }) }),
      expect.objectContaining({ name: "settings.plugin.item", options: expect.objectContaining({ key: "mtm-admin" }) }),
    ]));
    expect(registered.filter((entry) => entry.name === "sidebar.footer.action")).toHaveLength(0);
    expect(registered.filter((entry) => entry.name === "shell.overlay")).toHaveLength(3);
    for (const cleanup of cleanups.reverse()) void cleanup();
    expect(p2p.getSnapshot().status).toBe("closed");
    expect(registered).toHaveLength(0);
  });
});
