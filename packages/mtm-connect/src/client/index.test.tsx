// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { mount, type MtmharnessFrontendExtensionContext } from "./index.ts";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement | undefined;
let cleanup: (() => void) | undefined;

afterEach(async () => {
  await act(async () => { cleanup?.(); });
  container?.remove();
  container = undefined;
  cleanup = undefined;
});

function context(root: HTMLElement): MtmharnessFrontendExtensionContext {
  const controller = new AbortController();
  return {
    apiVersion: 1,
    id: "mtm-connect",
    version: "0.2.0",
    root,
    document,
    signal: controller.signal,
    registerCleanup: () => {},
  };
}

describe("mtm-connect frontend extension", () => {
  it("mounts a usable mock panel and cleans up its resources", async () => {
    container = document.createElement("div");
    container.setAttribute("style", "color: red;");
    container.setAttribute("tabindex", "0");
    document.body.append(container);
    await act(async () => {
      cleanup = mount(context(container!));
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Device connections");
    expect(container.textContent).toContain("Android device");

    const disconnect = [...container.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Disconnect");
    expect(disconnect).toBeDefined();
    await act(async () => { disconnect?.click(); await Promise.resolve(); });
    expect(container.textContent).toContain("Android device disconnected");

    const close = container.querySelector<HTMLButtonElement>('button[aria-label="Close MTM Connect"]');
    await act(async () => { close?.click(); await Promise.resolve(); });
    expect(container.hidden).toBe(true);
    await act(async () => { cleanup?.(); await Promise.resolve(); });
    expect(container.querySelector(".mtm-connect-view")).toBeNull();
    expect(container.getAttribute("style")).toBe("color: red;");
    expect(container.getAttribute("tabindex")).toBe("0");
    expect(container.hidden).toBe(false);
    expect(document.head.querySelector('style[data-mtm-secondary-extension="mtm-connect"]')).toBeNull();
  });
});
