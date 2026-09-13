import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { bootstrap } from "./bootstrap.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("browser bootstrap", () => {
  beforeEach(() => {
    Object.defineProperty(window, "scrollTo", {
      configurable: true,
      value: () => undefined,
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it("owns one root, keeps widget routes in memory, and cleans up", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const initialUrl = window.location.href;
    let handle!: ReturnType<typeof bootstrap>;
    await act(async () => {
      handle = bootstrap({
        target,
        apiOrigin: "https://api.example.test",
        mode: "floating",
      });
    });

    expect(bootstrap({ target, apiOrigin: "https://api.example.test" })).toBe(
      handle,
    );
    expect(
      target.querySelectorAll('[data-mtmharness-root="true"]'),
    ).toHaveLength(1);
    await act(async () => {
      handle.open();
      await handle.openP2p();
    });

    const host = target.querySelector("[data-mtmharness-root]");
    expect(host?.shadowRoot?.textContent).toContain("P2P node");
    expect(window.location.href).toBe(initialUrl);

    await act(async () => {
      handle.unmount();
    });
    expect(target.querySelector("[data-mtmharness-root]")).toBeNull();
  });
});
