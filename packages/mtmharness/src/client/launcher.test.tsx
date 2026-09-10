// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmHarnessLauncherOverlay, MTM_HARNESS_LAUNCHER_APP_URL } from "./launcher";
import { disposeMtmHarnessLauncher } from "./launcher-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => { root?.unmount(); });
  disposeMtmHarnessLauncher();
  container?.remove();
  root = undefined;
  container = undefined;
});

describe("MtmHarnessLauncherOverlay", () => {
  it("opens the fixed-version app in the shell overlay and unmounts cleanly", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => { root?.render(<MtmHarnessLauncherOverlay />); });

    const open = container.querySelector("button[aria-label=\"Open MTM cloud workspace\"]") as HTMLButtonElement;
    expect(open).not.toBeNull();
    expect(open.style.zIndex).toBe("");

    act(() => { open.click(); });
    const layer = container.querySelector("[data-mtmharness-launcher=\"true\"]") as HTMLDivElement;
    const frame = container.querySelector("iframe") as HTMLIFrameElement;
    expect(layer.style.zIndex).toBe("");
    expect(frame.src).toBe(MTM_HARNESS_LAUNCHER_APP_URL);
    expect(frame.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");

    act(() => { root?.unmount(); });
    root = undefined;
    expect(container.childElementCount).toBe(0);
  });
});
