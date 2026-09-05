// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { mount, type MtmharnessFrontendExtensionContext } from "./launcher";

const documentBody = document.body;

afterEach(() => {
  documentBody.replaceChildren();
});

function context(): MtmharnessFrontendExtensionContext {
  const root = document.createElement("div");
  documentBody.append(root);
  return {
    apiVersion: 1,
    id: "mtm-admin",
    version: "0.1.1",
    root,
    document,
    signal: new AbortController().signal,
    registerCleanup: () => undefined,
  };
}

describe("mtm-admin launcher", () => {
  it("opens the versioned standalone app without receiving auth state", () => {
    const current = context();
    mount(current);
    const link = current.root.querySelector("a");

    expect(link?.href).toBe("https://unpkg.com/mtm-admin@0.1.1/dist/standalone/index.html");
    expect(link?.target).toBe("_blank");
    expect(link?.rel).toBe("noopener noreferrer");
    expect(link?.textContent).toBe("Open MTM Admin");
  });

  it("restores the owned root on cleanup", () => {
    const current = context();
    const beforeStyle = current.root.getAttribute("style");
    const beforeHidden = current.root.hidden;
    const cleanup = mount(current);

    cleanup();

    expect(current.root.childElementCount).toBe(0);
    expect(current.root.getAttribute("style")).toBe(beforeStyle);
    expect(current.root.hidden).toBe(beforeHidden);
  });
});
