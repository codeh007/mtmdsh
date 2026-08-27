import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryTokenSource } from "@/app/auth";
import { DshApiError, type DshClient, type DshWorkspaceView, type MtmSessionSummary } from "@/dsh/adapter";
import { SandboxApiError, type SandboxClient, type SandboxRecord } from "@/sandbox/adapter";
import { MtmHarnessRuntime } from "./runtime";

class TestWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static last: TestWebSocket | undefined;
  static instances: TestWebSocket[] = [];
  readyState = 0;
  onopen: (() => void) | undefined;
  onmessage: ((event: { data: unknown }) => void) | undefined;
  onerror: (() => void) | undefined;
  onclose: (() => void) | undefined;

  constructor(readonly url: URL, readonly protocols: readonly string[] = []) {
    TestWebSocket.last = this;
    TestWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = TestWebSocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data });
  }

  close(): void {
    this.readyState = TestWebSocket.CLOSING;
    this.onclose?.();
  }

  emitClose(): void {
    this.onclose?.();
  }
}

function createRuntimeOptions(client: DshClient, sandboxClient: SandboxClient) {
  return {
    accessToken: "test-token",
    webSocketFactory: (url: URL, protocols: readonly string[]) => new TestWebSocket(url, protocols) as unknown as WebSocket,
    client,
    sandboxClient,
  };
}

const sandboxOne: SandboxRecord = {
  contractVersion: 1,
  id: "sbx_00000000-0000-4000-8000-000000000001",
  workspaceId: "ws_00000000-0000-4000-8000-000000000001",
  owner: { issuer: "better_auth", subject: "user-1" },
  name: "Personal",
  status: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};
const sandboxTwo: SandboxRecord = { ...sandboxOne, id: "sbx_00000000-0000-4000-8000-000000000002", workspaceId: "ws_00000000-0000-4000-8000-000000000002", name: "Project" };

function createSandboxClient(selectedId = sandboxOne.id): SandboxClient {
  let selected = selectedId === sandboxTwo.id ? sandboxTwo : sandboxOne;
  return {
    listSandboxes: async () => ({ sandboxes: [sandboxOne, sandboxTwo], defaultSandbox: selected }),
    getDefaultSandbox: async () => selected,
    createSandbox: async (name) => ({ sandbox: { ...sandboxTwo, name }, defaultSandbox: selected }),
    selectSandbox: async (sandboxId) => {
      if (sandboxId === sandboxOne.id) selected = sandboxOne;
      else if (sandboxId === sandboxTwo.id) selected = sandboxTwo;
      else throw new Error("sandbox_not_found");
      return selected;
    },
  };
}

function createSummary(sessionId: string, title: string, parentSessionId?: string): MtmSessionSummary {
  return { sessionId, title, updatedAt: Date.now(), running: false, blank: false, ...(parentSessionId === undefined ? {} : { parentSessionId }) };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

function createClient() {
  const sessions: MtmSessionSummary[] = [createSummary("session-1", "Plan")];
  const workspace: DshWorkspaceView = { workspaceId: "workspace-1", path: "/workspace", title: "workspace", sessionIds: ["session-1"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  const calls: string[] = [];
  const scopes: unknown[] = [];
  const client: DshClient = {
    setSandboxScope: (scope) => { scopes.push(scope); },
    listWorkspaces: async () => ({ items: [{ ...workspace, sessionIds: sessions.map((session) => session.sessionId) }], archivedSessionIds: [] }),
    listSessions: async () => ({ items: sessions.map((session) => ({ ...session })) }),
    createSession: async ({ workspaceId } = {}) => {
      const session = createSummary("session-2", "session-2");
      sessions.push(session);
      calls.push("create:" + (workspaceId ?? "none"));
      return { sessionId: session.sessionId };
    },
    loadHistory: async ({ sessionId }) => ({
      events: sessionId === "session-1" ? [{ event: { type: "user/message", seq: 1, data: { id: "user-1", content: [{ type: "text", text: "Hello" }] } } }] : [],
      hasMore: false,
    }),
    renameSession: async ({ sessionId, title }) => {
      const session = sessions.find((item) => item.sessionId === sessionId);
      if (session) session.title = title;
      calls.push("rename:" + title);
      return { title, seq: 2 };
    },
    forkSession: async ({ sessionId }) => {
      const child = createSummary("session-fork", "Plan (1)", sessionId);
      sessions.push(child);
      calls.push("fork:" + sessionId);
      return { sessionId: child.sessionId };
    },
    prompt: async () => ({ accepted: true }),
    openSocket: async (_input, factory) => {
      if (factory === undefined) throw new Error("fixture socket factory is required");
      return factory(new URL("wss://api.example.test/api/dsh/events.mux"), ["dsh.v1", "dsh-ticket.fixture"]);
    },
  };
  return { client, calls, scopes, sandboxClient: createSandboxClient() };
}

beforeEach(() => {
  vi.stubGlobal("WebSocket", TestWebSocket);
  TestWebSocket.last = undefined;
  TestWebSocket.instances = [];
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe("MtmHarnessRuntime registry", () => {
  it("refreshes the registry, loads selected history, and keeps session actions in one snapshot", async () => {
    const { client, calls, scopes, sandboxClient } = createClient();
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, sandboxClient));

    await runtime.refreshRegistry();
    expect(runtime.getSnapshot()).toMatchObject({ registryStatus: "idle", sandboxCatalogStatus: "idle", selectedSandboxId: sandboxOne.id, workspaceId: sandboxOne.workspaceId, sandboxLifecycleStatus: "ready", workspaces: [{ workspaceId: "workspace-1" }], sessions: [{ sessionId: "session-1", title: "Plan" }] });
    expect(scopes).toContainEqual({ sandboxId: sandboxOne.id, workspaceId: sandboxOne.workspaceId });

    await runtime.selectSession("session-1");
    expect(runtime.getSnapshot()).toMatchObject({ selectedSessionId: "session-1", status: "idle", messages: [{ role: "user", text: "Hello" }] });

    await runtime.renameSession("session-1", "Renamed plan");
    expect(runtime.getSnapshot().sessions[0]).toMatchObject({ sessionId: "session-1", title: "Renamed plan" });

    await expect(runtime.forkSession("session-1")).resolves.toBe("session-fork");
    expect(runtime.getSnapshot()).toMatchObject({ selectedSessionId: "session-fork" });

    await expect(runtime.createSession("workspace-1")).resolves.toBe("session-2");
    expect(runtime.getSnapshot()).toMatchObject({ selectedSessionId: "session-2" });
    expect(calls).toEqual(["rename:Renamed plan", "fork:session-1", "create:workspace-1"]);
    runtime.dispose();
  });

  it("publishes auth failures while refreshing the registry", async () => {
    const client: DshClient = {
    setSandboxScope: () => undefined,
      listWorkspaces: async () => { throw new DshApiError("Authentication is required", "auth_required"); },
      listSessions: async () => ({ items: [] }),
      createSession: async () => ({ sessionId: "session-1" }),
      loadHistory: async () => ({ events: [], hasMore: false }),
      renameSession: async () => ({ title: "session", seq: 1 }),
      forkSession: async () => ({ sessionId: "session-2" }),
      prompt: async () => ({ accepted: true }),
      openSocket: async (_input, factory) => {
        if (factory === undefined) throw new Error("fixture socket factory is required");
        return factory(new URL("wss://api.example.test/api/dsh/events.mux"), ["dsh.v1", "dsh-ticket.fixture"]);
      },
    };
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, createSandboxClient()));

    await expect(runtime.refreshRegistry()).rejects.toMatchObject({ code: "auth_required", message: "Authentication is required" });
    expect(runtime.getSnapshot()).toMatchObject({ registryStatus: "error", registryError: "Authentication is required", status: "auth-required" });
    runtime.dispose();
  });

  it("serializes concurrent session mutations", async () => {
    const base = createClient();
    const first = deferred<{ title: string; seq: number }>();
    const second = deferred<{ title: string; seq: number }>();
    const calls: string[] = [];
    const client: DshClient = {
      ...base.client,
      renameSession: async ({ title }) => {
        calls.push(title);
        return calls.length === 1 ? first.promise : second.promise;
      },
    };
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, base.sandboxClient));
    await runtime.refreshRegistry();

    const firstRename = runtime.renameSession("session-1", "First");
    const secondRename = runtime.renameSession("session-1", "Second");
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["First"]);

    first.resolve({ title: "First", seq: 1 });
    await firstRename;
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["First", "Second"]);
    second.resolve({ title: "Second", seq: 2 });
    await secondRename;
    expect(runtime.getSnapshot().sessions[0]).toMatchObject({ title: "Second" });
    runtime.dispose();
  });

  it("rolls back a failed selection to the previous session", async () => {
    const base = createClient();
    const client: DshClient = {
      ...base.client,
      loadHistory: async ({ sessionId }) => {
        if (sessionId === "session-failed") throw new DshApiError("History is unavailable", "history_unavailable");
        return base.client.loadHistory({ sessionId });
      },
    };
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, base.sandboxClient));
    await runtime.refreshRegistry();
    await runtime.selectSession("session-1");
    expect(sessionStorage.getItem("mtmharness:v2:session:https://api.example.test:explicit:sbx_00000000-0000-4000-8000-000000000001")).toBe("session-1");

    await expect(runtime.selectSession("session-failed")).rejects.toMatchObject({ code: "history_unavailable" });
    expect(runtime.getSnapshot()).toMatchObject({ selectedSessionId: "session-1", status: "error", messages: [{ role: "user", text: "Hello" }] });
    expect(sessionStorage.getItem("mtmharness:v2:session:https://api.example.test:explicit:sbx_00000000-0000-4000-8000-000000000001")).toBe("session-1");
    runtime.dispose();
  });

  it("switches sandbox scope, fences the old socket, and reopens the new scope", async () => {
    const { client, sandboxClient } = createClient();
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, sandboxClient));
    await runtime.refreshRegistry();
    await runtime.selectSession("session-1");
    const oldSocket = TestWebSocket.last;
    expect(oldSocket?.url.pathname).toBe("/api/dsh/events.mux");

    await runtime.selectSandbox(sandboxTwo.id);

    expect(oldSocket?.readyState).toBe(TestWebSocket.CLOSING);
    expect(TestWebSocket.last?.url.pathname).toBe("/api/dsh/events.mux");
    expect(runtime.getSnapshot()).toMatchObject({ selectedSandboxId: sandboxTwo.id, workspaceId: sandboxTwo.workspaceId, selectedSessionId: "session-1", status: "idle" });
    oldSocket?.emit(JSON.stringify({ type: "server-request", payload: { type: "session/event", sessionId: "session-1", event: { type: "assistant/message", seq: 9, data: { message: { id: "stale", content: [{ type: "text", text: "stale" }] } } } } }));
    expect(runtime.getSnapshot().messages.some((message) => message.id === "stale")).toBe(false);
    runtime.dispose();
  });

  it("restores the previous sandbox view when selection fails", async () => {
    const base = createClient();
    const failingSandboxClient: SandboxClient = {
      ...base.sandboxClient,
      selectSandbox: async (sandboxId) => {
        if (sandboxId === sandboxTwo.id) throw new SandboxApiError("Sandbox not found", "sandbox_not_found", 404);
        return sandboxOne;
      },
    };
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(base.client, failingSandboxClient));
    await runtime.refreshRegistry();
    await runtime.selectSession("session-1");
    const previousMessages = runtime.getSnapshot().messages;

    await expect(runtime.selectSandbox(sandboxTwo.id)).rejects.toMatchObject({ code: "sandbox_not_found" });
    expect(runtime.getSnapshot()).toMatchObject({ selectedSandboxId: sandboxOne.id, workspaceId: sandboxOne.workspaceId, selectedSessionId: "session-1", messages: previousMessages, sandboxError: "Sandbox not found", status: "error" });
    expect(TestWebSocket.last?.url.pathname).toBe("/api/dsh/events.mux");
    expect(TestWebSocket.last?.readyState).toBe(TestWebSocket.OPEN);
    runtime.dispose();
  });

  it("ignores malformed mux frames but applies valid host errors", async () => {
    const { client, sandboxClient } = createClient();
    const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, sandboxClient));
    await runtime.refreshRegistry();
    await runtime.selectSession("session-1");
    const socket = TestWebSocket.last;
    expect(socket).not.toBeUndefined();

    socket?.emit(JSON.stringify({ type: "server-request", payload: { type: "session/event", sessionId: "session-1", event: { type: "custom/event", seq: "bad" } } }));
    expect(runtime.getSnapshot().status).toBe("idle");
    expect(runtime.getSnapshot().messages).toHaveLength(1);
    socket?.emit(JSON.stringify({ type: "server-request", payload: { type: "session/event", sessionId: "session-1", event: { type: "custom/event", seq: 2, time: 2, data: {} } } }));
    expect(runtime.getSnapshot().status).toBe("idle");
    socket?.emit(JSON.stringify({ type: "server-request", payload: { type: "host/agent-error", sessionId: "session-1", message: "Agent failed" } }));
    expect(runtime.getSnapshot()).toMatchObject({ status: "error", error: "Agent failed" });
    runtime.dispose();
  });

  it("reconnects through a custom client without a token source", async () => {
    vi.useFakeTimers();
    try {
      const { client, sandboxClient } = createClient();
      const runtime = new MtmHarnessRuntime("https://api.example.test", {
        client,
        sandboxClient,
        webSocketFactory: (url: URL, protocols: readonly string[]) => new TestWebSocket(url, protocols) as unknown as WebSocket,
      });
      await runtime.refreshRegistry();
      const selecting = runtime.selectSession("session-1");
      await vi.runAllTimersAsync();
      await selecting;
      TestWebSocket.last?.close();
      expect(runtime.getSnapshot()).toMatchObject({ status: "loading", operation: "reconnecting" });
      await vi.advanceTimersByTimeAsync(250);
      await vi.runAllTimersAsync();
      expect(TestWebSocket.instances).toHaveLength(2);
      expect(runtime.getSnapshot().status).toBe("idle");
      runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("gets a new ticket-aware socket after a disconnect", async () => {
    vi.useFakeTimers();
    try {
      const { client, sandboxClient } = createClient();
      const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, sandboxClient));
      await runtime.refreshRegistry();
      const selecting = runtime.selectSession("session-1");
      await vi.runAllTimersAsync();
      await selecting;
      const first = TestWebSocket.last;
      first?.close();
      expect(runtime.getSnapshot()).toMatchObject({ status: "loading", operation: "reconnecting" });
      await vi.advanceTimersByTimeAsync(250);
      await vi.runAllTimersAsync();
      expect(TestWebSocket.instances).toHaveLength(2);
      expect(TestWebSocket.instances[1]?.protocols).toEqual(["dsh.v1", "dsh-ticket.fixture"]);
      expect(runtime.getSnapshot().status).toBe("idle");
      runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a stale close from a replaced socket", async () => {
    vi.useFakeTimers();
    try {
      const { client, sandboxClient } = createClient();
      const runtime = new MtmHarnessRuntime("https://api.example.test", createRuntimeOptions(client, sandboxClient));
      await runtime.refreshRegistry();
      const selecting = runtime.selectSession("session-1");
      await vi.runAllTimersAsync();
      await selecting;
      const first = TestWebSocket.instances[0];
      first?.close();
      await vi.advanceTimersByTimeAsync(250);
      await vi.runAllTimersAsync();
      const second = TestWebSocket.instances[1];
      expect(TestWebSocket.instances).toHaveLength(2);
      first?.emitClose();
      expect(TestWebSocket.instances).toHaveLength(2);
      expect(second?.readyState).toBe(TestWebSocket.OPEN);
      expect(runtime.getSnapshot().status).toBe("idle");
      runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the old account socket, selection, and session hint", async () => {
    const source = new MemoryTokenSource("test-token", "account-a");
    const { client, sandboxClient } = createClient();
    const runtime = new MtmHarnessRuntime("https://api.example.test", { ...createRuntimeOptions(client, sandboxClient), tokenSource: source });
    await runtime.refreshRegistry();
    await runtime.selectSession("session-1");
    const socket = TestWebSocket.last;
    const key = "mtmharness:v2:session:https://api.example.test:account-a:" + sandboxOne.id;
    expect(sessionStorage.getItem(key)).toBe("session-1");

    source.clear();

    expect(socket?.readyState).toBe(TestWebSocket.CLOSING);
    expect(runtime.getSnapshot()).toMatchObject({ status: "auth-required", selectedSandboxId: undefined, selectedSessionId: undefined, sandboxes: [], sessions: [], messages: [] });
    expect(sessionStorage.getItem(key)).toBeNull();
    runtime.dispose();
  });
});
