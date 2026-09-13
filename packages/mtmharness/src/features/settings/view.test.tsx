import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmHarnessSettingsView } from "./view.js";
import type {
  MtmHarnessCapability,
  MtmHarnessSettingsCapability,
  MtmHarnessSettingsSnapshot,
} from "./contract.js";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => document.body.replaceChildren());

function capability(status: "available" | "unavailable"): MtmHarnessCapability {
  const snapshot = { status } as const;
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
  };
}

function settingsCapability(): MtmHarnessSettingsCapability {
  let snapshot: MtmHarnessSettingsSnapshot = {
    status: "available",
    writable: true,
    value: {
      codebaseMemoryEnabled: true,
      codebaseMemoryAugmentHooks: true,
      ponytailEnabled: true,
      ponytailMode: "full",
      ponytailSubagents: true,
      rtkMode: "auto",
    },
    user: {},
  };
  const listeners = new Set<() => void>();
  const publish = (): void => listeners.forEach((listener) => listener());
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async set(field, value) {
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } };
      publish();
    },
    async unset(field) {
      const user = { ...snapshot.user };
      delete user[field];
      snapshot = { ...snapshot, user };
      publish();
    },
  };
}

describe("MtmHarnessSettingsView", () => {
  it("renders explicit unavailable capability states", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<MtmHarnessSettingsView />));
    expect(container.querySelector('[data-status="unavailable"]')).not.toBeNull();
    expect(container.textContent).toContain("Coding settings");
    await act(async () => root.unmount());
  });

  it("writes browser-owned settings through the injected capability", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const settings = settingsCapability();
    const root = createRoot(container);
    await act(async () =>
      root.render(<MtmHarnessSettingsView settings={settings} auth={capability("available")} />),
    );
    const toggle = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(toggle?.checked).toBe(true);
    await act(async () => toggle?.click());
    expect(settings.getSnapshot().value?.codebaseMemoryEnabled).toBe(false);
    await act(async () => root.unmount());
  });
});
