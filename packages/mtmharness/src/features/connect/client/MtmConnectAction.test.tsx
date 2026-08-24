// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmConnectClientRuntime } from "./runtime.ts";
import { MtmConnectAction } from "./MtmConnectAction.tsx";

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

describe("MtmConnectAction", () => {
  it("opens the control panel and exposes realistic fixture state", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new MtmConnectClientRuntime();
    act(() => { root?.render(<MtmConnectAction wide runtime={runtime} />); });

    const trigger = document.querySelector<HTMLButtonElement>("button[aria-label=\"Open MTM Connect\"]");
    expect(trigger?.textContent).toContain("MTM Connect");
    act(() => { trigger?.click(); });
    expect(document.body.textContent).toContain("Connection control plane");
    expect(document.body.textContent).toContain("Local workstation (fixture)");
    expect(document.body.textContent).toContain("Unavailable adapters");
  });

  it("updates the snapshot when a fixture connection is enabled", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new MtmConnectClientRuntime();
    act(() => { root?.render(<MtmConnectAction wide runtime={runtime} />); });
    act(() => { document.querySelector<HTMLButtonElement>("button[aria-label=\"Open MTM Connect\"]")?.click(); });
    act(() => { document.querySelector<HTMLButtonElement>("button.mtmc-action-button-primary")?.click(); });
    expect(document.body.textContent).toContain("Online");
    expect(runtime.getSnapshot().snapshot.connections[0]?.observation.status).toBe("online");
  });
});
