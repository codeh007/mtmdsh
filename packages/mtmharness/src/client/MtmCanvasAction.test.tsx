// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CanvasRuntime } from "../features/canvas/client/runtime.ts";
import { MtmCanvasAction, type MtmCanvasActionProps } from "./MtmCanvasAction.tsx";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let container: HTMLDivElement | undefined;
let runtime: CanvasRuntime | undefined;

afterEach(() => {
  act(() => { root?.unmount(); });
  runtime?.dispose();
  container?.remove();
  root = undefined;
  runtime = undefined;
  container = undefined;
  document.body.replaceChildren();
});

describe("MtmCanvasAction", () => {
  it("opens the file-backed Canvas editor", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    runtime = new CanvasRuntime({ call: async () => ({ ok: true, value: [] }) });
    const useCanvas: MtmCanvasActionProps["useCanvas"] = (selector) => selector(runtime!.getSnapshot());
    act(() => { root?.render(<MtmCanvasAction wide actions={runtime} useCanvas={useCanvas} />); });

    const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Open Canvas"]');
    expect(trigger).not.toBeNull();
    act(() => { trigger?.click(); });
    expect(document.body.textContent).toContain("Canvas");
    expect(document.body.textContent).toContain("Loading files...");

    const close = document.querySelector<HTMLButtonElement>('button[aria-label="Close Canvas"]');
    expect(close).not.toBeNull();
    act(() => { close?.click(); });
    expect(document.body.textContent).not.toContain("No canvas files yet.");
  });
});
