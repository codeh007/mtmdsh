// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmHarnessLauncherAction, MtmHarnessLauncherOverlay, MTM_HARNESS_LAUNCHER_APP_URL, MTM_HARNESS_LAUNCHER_READY } from "./launcher";
import { disposeMtmHarnessLauncher, openMtmHarnessLauncher } from "./launcher-state";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => { root?.unmount(); });
  disposeMtmHarnessLauncher();
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.replaceChildren();
});

describe("MtmHarnessLauncher", () => {
  it("opens the latest CDN static app without credential-bearing URL state", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => {
      root?.render(<><MtmHarnessLauncherAction wide /><MtmHarnessLauncherOverlay /></>);
    });

    expect(MTM_HARNESS_LAUNCHER_READY).toBe(true);
    expect((container.querySelector('button[aria-label="Open MTM cloud workspace"]') as HTMLButtonElement).disabled).toBe(false);
    act(() => { openMtmHarnessLauncher(); });
    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.src).toBe(MTM_HARNESS_LAUNCHER_APP_URL);
    expect(frame?.src).not.toContain("/mtmdsh/");
    expect(frame?.src).not.toContain("token");
    expect(frame?.getAttribute("sandbox")).toContain("allow-scripts");
    expect(frame?.getAttribute("sandbox")).toContain("allow-same-origin");
    expect(frame?.getAttribute("sandbox")).not.toContain("allow-top-navigation");
    expect(frame?.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(container.querySelector('[data-mtmharness-launcher="true"]')).not.toBeNull();

    const close = container.querySelector('button[aria-label="Close MTM cloud workspace"]') as HTMLButtonElement;
    act(() => { close.click(); });
    expect(container.querySelector("iframe")).toBeNull();
  });
});
