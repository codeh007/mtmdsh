// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MtmHarnessRuntime, RuntimeSnapshot } from "@/runtime";
import { ConversationSurface } from "./conversation-surface";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const snapshot: RuntimeSnapshot = {
  status: "auth-required",
  connectionStatus: "disconnected",
  messages: [],
  registryStatus: "idle",
  sandboxCatalogStatus: "idle",
  sandboxes: [],
  workspaces: [],
  archivedSessionIds: [],
  sessions: [],
};

function createRuntime(): MtmHarnessRuntime {
  return {
    getSnapshot: () => snapshot,
    subscribe: vi.fn(() => () => undefined),
    connect: vi.fn(async () => undefined),
    prompt: vi.fn(async () => undefined),
  } as unknown as MtmHarnessRuntime;
}

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
});

describe("ConversationSurface authentication gate", () => {
  it("explains the anonymous path without presenting auth as transport failure", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ConversationSurface
          config={{ apiOrigin: "https://api.example.test", allowedParentOrigins: [], mode: "floating" }}
          runtime={createRuntime()}
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.textContent).toContain("Sign in above or continue anonymously on the sign-in page");
    expect((container.querySelector("#mtmharness-prompt") as HTMLTextAreaElement).disabled).toBe(true);
    expect((container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement).disabled).toBe(true);
  });
});
