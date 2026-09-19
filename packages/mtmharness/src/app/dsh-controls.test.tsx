import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type {
  MtmHarnessDshIntegrationBridge,
  MtmHarnessDshIntegrationSnapshot,
} from "../../host/contract.js";
import { DshIntegrationControl } from "./dsh-controls.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => document.body.replaceChildren());

function createBridge(): MtmHarnessDshIntegrationBridge {
  let snapshot: MtmHarnessDshIntegrationSnapshot = { status: "unavailable" };
  const listeners = new Set<() => void>();
  const publish = (next: MtmHarnessDshIntegrationSnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    enable: async () => publish({ status: "active" }),
    disable: async () => publish({ status: "disposing" }),
  };
}

describe("DSH integration control", () => {
  it("shows unavailable without a host bridge", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<DshIntegrationControl />));
    expect(
      container.querySelector('[data-dsh-integration="unavailable"]'),
    ).not.toBeNull();
    await act(async () => root.unmount());
  });

  it("delegates enable and disable to the host bridge", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const bridge = createBridge();
    let opened = false;
    const root = createRoot(container);
    await act(async () =>
      root.render(
        <DshIntegrationControl
          bridge={bridge}
          onOpenP2p={async () => {
            opened = true;
          }}
        />,
      ),
    );
    const action = container.querySelector("button");
    expect(action).not.toBeNull();
    await act(async () => action?.click());
    expect(
      container.querySelector('[data-dsh-integration="active"]'),
    ).not.toBeNull();
    expect(opened).toBe(true);
    await act(async () => container.querySelector("button")?.click());
    expect(
      container.querySelector('[data-dsh-integration="disposing"]'),
    ).not.toBeNull();
    await act(async () => root.unmount());
  });
});
