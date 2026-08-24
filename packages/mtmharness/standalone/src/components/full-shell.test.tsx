import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DshClient, DshWorkspaceView, MtmSessionSummary } from "@/dsh/adapter";
import type { SandboxClient, SandboxRecord } from "@/sandbox/adapter";
import { MtmHarnessRuntime } from "@/runtime";
import { FullShellFrame } from "./full-shell";
import { FULL_SHELL_SLOTS } from "./full-shell-contract";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

class TestWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  readyState = 0;
  onopen: (() => void) | undefined;
  onclose: (() => void) | undefined;

  constructor(readonly url: URL) {
    setTimeout(() => {
      this.readyState = TestWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  close(): void {
    this.readyState = TestWebSocket.CLOSING;
    this.onclose?.();
  }
}

function createRuntimeOptions(client: DshClient, sandboxClient: SandboxClient) {
  return {
    accessToken: "test-token",
    webSocketFactory: (url: URL) => new TestWebSocket(url) as unknown as WebSocket,
    client,
    sandboxClient,
  };
}

const sandbox: SandboxRecord = {
  contractVersion: 1,
  id: "sbx_00000000-0000-4000-8000-000000000001",
  workspaceId: "ws_00000000-0000-4000-8000-000000000001",
  owner: { issuer: "better_auth", subject: "user-1" },
  name: "Personal",
  status: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const secondSandbox: SandboxRecord = { ...sandbox, id: "sbx_00000000-0000-4000-8000-000000000002", workspaceId: "ws_00000000-0000-4000-8000-000000000002", name: "Project" };

function createSandboxClient(): SandboxClient {
  let selected = sandbox;
  return {
    listSandboxes: async () => ({ sandboxes: [sandbox, secondSandbox], defaultSandbox: selected }),
    getDefaultSandbox: async () => selected,
    createSandbox: async (name) => ({ sandbox: { ...secondSandbox, name }, defaultSandbox: selected }),
    selectSandbox: async (sandboxId) => {
      selected = sandboxId === secondSandbox.id ? secondSandbox : sandbox;
      return selected;
    },
  };
}

function createFixtureClient(): DshClient {
  return {
    setSandboxScope: () => undefined,
    listWorkspaces: async () => ({ items: [], archivedSessionIds: [] }),
    listSessions: async () => ({ items: [] }),
    createSession: async () => ({ sessionId: "session-fixture" }),
    loadHistory: async () => ({ events: [], hasMore: false }),
    renameSession: async ({ title }) => ({ title, seq: 1 }),
    forkSession: async () => ({ sessionId: "session-fork" }),
    prompt: async () => ({ accepted: true }),
  };
}

function createLiveClient(): DshClient {
  const workspace: DshWorkspaceView = { workspaceId: "workspace-live", path: "/workspace", title: "workspace", sessionIds: ["session-live"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const session: MtmSessionSummary = { sessionId: "session-live", title: "Live session", updatedAt: Date.now(), running: false, blank: false };
  return {
    setSandboxScope: () => undefined,
    listWorkspaces: async () => ({ items: [workspace], archivedSessionIds: [] }),
    listSessions: async () => ({ items: [session] }),
    createSession: async () => ({ sessionId: "session-new" }),
    loadHistory: async () => ({ events: [], hasMore: false }),
    renameSession: async ({ title }) => ({ title, seq: 1 }),
    forkSession: async () => ({ sessionId: "session-fork" }),
    prompt: async () => ({ accepted: true }),
  };
}

describe("FullShellFrame", () => {
  it("renders the official shell slot composition and disposes cleanly", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(createFixtureClient(), createSandboxClient()));
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <FullShellFrame runtime={runtime}>
          <div data-testid="shell-content">content</div>
        </FullShellFrame>,
      );
    });

    expect(container.querySelector('[data-shell-profile="full"]')).not.toBeNull();
    expect(container.querySelector('[data-runtime="adapter"]')).not.toBeNull();
    for (const slot of FULL_SHELL_SLOTS) expect(container.querySelector('[data-slot="' + slot + '"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="shell-content"]')).not.toBeNull();
    expect(container.textContent).toContain("No sessions yet");

    await act(async () => {
      root.unmount();
    });
    runtime.dispose();
    expect(container.firstElementChild).toBeNull();
  });

  it("renders and switches the sandbox selector without losing the shell", async () => {
    vi.stubGlobal("WebSocket", TestWebSocket);
    const container = document.createElement("div");
    document.body.append(container);
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(createLiveClient(), createSandboxClient()));
    await runtime.refreshRegistry();
    const root = createRoot(container);

    await act(async () => {
      root.render(<FullShellFrame runtime={runtime}><div>conversation</div></FullShellFrame>);
    });

    const selector = container.querySelector("select[aria-label=\"Sandbox\"]") as HTMLSelectElement;
    expect(selector).not.toBeNull();
    expect(selector.value).toBe(sandbox.id);
    expect(container.querySelector('[data-slot="sandbox.control"]')?.textContent).toContain("ready");

    await act(async () => {
      selector.value = secondSandbox.id;
      selector.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(selector.value).toBe(secondSandbox.id);
    expect(runtime.getSnapshot().workspaceId).toBe(secondSandbox.workspaceId);

    await act(async () => { root.unmount(); });
    runtime.dispose();
  });

  it("renders live registry sessions and selects one from the sidebar", async () => {
    vi.stubGlobal("WebSocket", TestWebSocket);
    const container = document.createElement("div");
    document.body.append(container);
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(createLiveClient(), createSandboxClient()));
    await runtime.refreshRegistry();
    const root = createRoot(container);

    await act(async () => {
      root.render(<FullShellFrame runtime={runtime}><div>conversation</div></FullShellFrame>);
    });

    const row = container.querySelector('[data-session-id="session-live"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain("Live session");
    await act(async () => {
      (row as HTMLButtonElement).click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-slot="conversation.session.header"]')?.textContent).toContain("Live session");

    await act(async () => {
      root.unmount();
    });
    runtime.dispose();
  });
});
