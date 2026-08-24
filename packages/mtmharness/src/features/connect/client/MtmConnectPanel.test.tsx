// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmConnectClientRuntime } from "./runtime.ts";
import { MtmConnectPanel } from "./MtmConnectPanel.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;
let runtime: MtmConnectClientRuntime | undefined;

afterEach(() => {
  act(() => { root?.unmount(); });
  runtime?.dispose();
  container?.remove();
  root = undefined;
  runtime = undefined;
  container = undefined;
  document.body.replaceChildren();
});

function renderPanel(): void {
  act(() => { root?.render(<MtmConnectPanel state={runtime!.getSnapshot()} actions={runtime!} />); });
}

describe("MtmConnectPanel", () => {
  it("renders the compact fixture control surface", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new MtmConnectClientRuntime({ fixture: true });
    renderPanel();

    expect(document.body.textContent).toContain("连接");
    expect(document.body.textContent).toContain("Local workstation (fixture)");
    expect(document.body.textContent).not.toContain("Unavailable adapters");
    expect(document.body.textContent).not.toContain("Connection control plane");
  });

  it("updates the snapshot when a fixture connection is enabled", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new MtmConnectClientRuntime({ fixture: true });
    renderPanel();

    act(() => { document.querySelector<HTMLButtonElement>("button.mtmc-action-button-primary")?.click(); });
    renderPanel();
    expect(document.body.textContent).toContain("在线");
    expect(runtime.getSnapshot().snapshot.connections[0]?.observation.status).toBe("online");
  });
});
