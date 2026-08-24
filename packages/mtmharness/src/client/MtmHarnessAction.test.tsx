// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmConnectClientRuntime } from "../features/connect/client/runtime.ts";
import { MtmHarnessAction, type MtmHarnessActionProps } from "./MtmHarnessAction.tsx";

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

function renderAction(wide: boolean): void {
  const useConnect: MtmHarnessActionProps["useConnect"] = (selector) => selector(runtime!.getSnapshot());
  act(() => {
    root?.render(<MtmHarnessAction wide={wide} actions={runtime!} useConnect={useConnect} />);
  });
}

describe("MtmHarnessAction", () => {
  it("opens the unified MTM control panel", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new MtmConnectClientRuntime({ fixture: true });
    renderAction(true);

    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="打开 MTM"]');
    expect(trigger?.textContent).toContain("MTM");
    act(() => { trigger?.click(); });
    expect(document.body.textContent).toContain("连接");
    expect(document.body.textContent).toContain("Local workstation (fixture)");

    const close = document.querySelector<HTMLButtonElement>('button[aria-label="关闭 MTM"]');
    expect(close).not.toBeNull();
    act(() => { close?.click(); });
    expect(document.body.textContent).not.toContain("Local workstation (fixture)");
  });

  it("uses a compact MTM mark in the rail", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new MtmConnectClientRuntime({ fixture: true });
    renderAction(false);

    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="打开 MTM"]');
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toBe("MTM");
  });
});
