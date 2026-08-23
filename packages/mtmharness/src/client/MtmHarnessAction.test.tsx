// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { MtmHarnessAction } from "./MtmHarnessAction.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  root = undefined;
  container = undefined;
  document.body.replaceChildren();
});

describe("MtmHarnessAction", () => {
  it("opens and closes the plugin panel", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => { root?.render(<MtmHarnessAction wide />); });

    const trigger = document.querySelector<HTMLButtonElement>("button[aria-label=\"Open MTM Harness\"]");
    expect(trigger?.textContent).toContain("MTM Harness");
    act(() => { trigger?.click(); });
    expect(document.body.textContent).toContain("The MTM Harness plugin is active");

    const close = document.querySelector<HTMLButtonElement>("button[aria-label=\"Close MTM Harness panel\"]");
    expect(close).not.toBeNull();
    act(() => { close?.click(); });
    expect(document.body.textContent).not.toContain("The MTM Harness plugin is active");
  });

  it("keeps the rail action icon-only", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => { root?.render(<MtmHarnessAction wide={false} />); });
    const trigger = document.querySelector<HTMLButtonElement>("button[aria-label=\"Open MTM Harness\"]");
    expect(trigger).not.toBeNull();
    expect(trigger?.textContent).toBe("");
  });
});
