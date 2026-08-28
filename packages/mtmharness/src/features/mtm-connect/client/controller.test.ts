// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MtmSecondaryClientRuntime } from "../../secondary/client.ts";
import { MtmConnectCardController } from "./controller.ts";

type SettingsSnapshot = {
  status: "ready";
  value: { enabled: boolean };
  base: { enabled: boolean };
  user: Record<string, unknown>;
  revision: number;
  writable: boolean;
  mode: "host";
};

function bench() {
  let snapshot: SettingsSnapshot = {
    status: "ready",
    value: { enabled: true },
    base: { enabled: true },
    user: {},
    revision: 0,
    writable: true,
    mode: "host",
  };
  const settingsListeners = new Set<() => void>();
  const publish = (enabled: boolean): void => {
    snapshot = { ...snapshot, value: { enabled }, user: enabled === true ? { enabled } : {}, revision: snapshot.revision + 1 };
    for (const listener of [...settingsListeners]) listener();
  };
  const settings = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      settingsListeners.add(listener);
      return () => { settingsListeners.delete(listener); };
    },
    async set(_field: string, enabled: boolean) {
      publish(enabled);
    },
    async unset() {
      publish(true);
    },
  };
  let runtimeState = { desired: false, status: "disabled" as const };
  const runtimeListeners = new Set<() => void>();
  const runtime = {
    getSnapshot: () => runtimeState,
    subscribe(listener: () => void) {
      runtimeListeners.add(listener);
      return () => { runtimeListeners.delete(listener); };
    },
    setEnabled: vi.fn(async (enabled: boolean) => {
      runtimeState = { desired: enabled, status: enabled ? "enabled" : "disabled" };
      for (const listener of [...runtimeListeners]) listener();
    }),
    show: vi.fn(),
    dispose: vi.fn(async () => {}),
  };
  return { settings, runtime, publish };
}

describe("mtm-connect settings controller", () => {
  it("enables the runtime by default, saves disable, opens, and disposes", async () => {
    const state = bench();
    const controller = new MtmConnectCardController(state.settings as never, state.runtime as never);
    const face = controller.inject();
    await vi.waitFor(() => { expect(state.runtime.setEnabled).toHaveBeenCalledWith(true); });

    face.edit(false);
    expect(face.hooks.mtmConnectCard.getSnapshot()).toMatchObject({ enabled: false, dirty: true });
    face.save();
    await vi.waitFor(() => { expect(face.hooks.mtmConnectCard.getSnapshot()).toMatchObject({ enabled: false, dirty: false, failed: false }); });
    expect(state.runtime.setEnabled).toHaveBeenCalledWith(false);

    face.open();
    expect(state.runtime.show).toHaveBeenCalledOnce();
    await controller.dispose();
    expect(state.runtime.dispose).toHaveBeenCalledOnce();
  });

  it("removes the loaded root after rapid false-true-false setting changes", async () => {
    document.body.replaceChildren();
    const manifest = {
      apiVersion: 1,
      id: "mtm-connect",
      version: "0.2.0",
      clientUrl: "https://static.example.test/mtm-connect.js",
      clientIntegrity: "sha256-" + "A".repeat(43) + "=",
    } as const;
    const runtime = new MtmSecondaryClientRuntime({
      document,
      fetch: async () => new Response("export function mount() {}", { status: 200 }),
      digest: async () => manifest.clientIntegrity,
      importModule: async () => ({
        mount: ({ root }: { root: HTMLElement }) => {
          root.textContent = "mounted";
          return () => {};
        },
      }),
    }, manifest);
    const state = bench();
    const controller = new MtmConnectCardController(state.settings as never, runtime);
    await vi.waitFor(() => { expect(runtime.getSnapshot()).toMatchObject({ desired: true, status: "enabled" }); });

    state.publish(false);
    state.publish(true);
    state.publish(false);
    await vi.waitFor(() => { expect(runtime.getSnapshot()).toEqual({ desired: false, status: "disabled" }); });
    expect(document.querySelector('[data-mtm-secondary-extension="mtm-connect"]')).toBeNull();
    await controller.dispose();
  });
});
