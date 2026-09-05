// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { MtmAdminCardController } from "./controller.ts";

type SettingsSnapshot = {
  status: "ready";
  value: { enabled: boolean };
  base: { enabled: boolean };
  user: Record<string, unknown>;
  writable: boolean;
};

function setup() {
  let snapshot: SettingsSnapshot = { status: "ready", value: { enabled: false }, base: { enabled: false }, user: {}, writable: true };
  const settingsListeners = new Set<() => void>();
  const publish = (enabled: boolean) => {
    snapshot = { ...snapshot, value: { enabled }, user: { enabled }, };
    for (const listener of settingsListeners) listener();
  };
  const settings = {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { settingsListeners.add(listener); return () => { settingsListeners.delete(listener); }; },
    async set(_field: string, enabled: boolean) { publish(enabled); },
    async unset() { snapshot = { ...snapshot, value: { enabled: false }, user: {} }; for (const listener of settingsListeners) listener(); },
  };
  let runtimeState = { desired: false, status: "disabled" as const };
  const runtimeListeners = new Set<() => void>();
  const runtime = {
    getSnapshot: () => runtimeState,
    subscribe(listener: () => void) { runtimeListeners.add(listener); return () => { runtimeListeners.delete(listener); }; },
    setEnabled: vi.fn(async (enabled: boolean) => { runtimeState = { desired: enabled, status: enabled ? "enabled" : "disabled" }; for (const listener of runtimeListeners) listener(); }),
    show: vi.fn(),
    dispose: vi.fn(async () => undefined),
  };
  return { settings, runtime, publish };
}

describe("mtm-admin settings controller", () => {
  it("keeps the launcher disabled until enabled, then saves, opens, and disposes", async () => {
    const state = setup();
    const controller = new MtmAdminCardController(state.settings as never, state.runtime as never);
    const face = controller.inject();
    await vi.waitFor(() => { expect(state.runtime.setEnabled).toHaveBeenCalledWith(false); });

    face.edit(true);
    expect(face.hooks.mtmAdminCard.getSnapshot()).toMatchObject({ enabled: true, dirty: true });
    face.save();
    await vi.waitFor(() => { expect(face.hooks.mtmAdminCard.getSnapshot()).toMatchObject({ enabled: true, dirty: false, failed: false }); });
    expect(state.runtime.setEnabled).toHaveBeenCalledWith(true);

    face.open();
    expect(state.runtime.show).toHaveBeenCalledOnce();
    await controller.dispose();
    expect(state.runtime.dispose).toHaveBeenCalledOnce();
  });
});
