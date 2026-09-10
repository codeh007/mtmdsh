import { afterEach, describe, expect, it, vi } from "vitest";
import { DshApiClient, DshApiError } from "./adapter";

const TICKET = "t".repeat(43);

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DshApiClient", () => {
  it("sends the official request envelope and derives session titles from projections", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { type: string; method: string; payload: unknown };
      expect(String(input)).toBe("https://api.example.test/api/dsh/session.list");
      expect(request).toMatchObject({ type: "client-request", method: "session.list", payload: {} });
      return Response.json({ type: "server-response", result: { ok: true, value: { items: [{ sessionId: "session-1", updatedAt: 100, running: false, blank: false, cwd: "/workspace/project", projections: { asOfSeq: 4, values: { title: "Plan" } } }] } } });
    });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("ambient fetch must not be used"); }));

    const result = await new DshApiClient("https://api.example.test/path", { tokenProvider: () => "test-token", fetch: fetchMock }).listSessions();

    expect(result.items[0]).toMatchObject({ sessionId: "session-1", title: "Plan", cwd: "/workspace/project" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts the official workspace and history result shapes", async () => {
    const values = [
      { items: [{ workspaceId: "workspace-1", path: "/workspace", title: "workspace", sessionIds: ["session-1"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }], archivedSessionIds: [] },
      { events: [{ event: { type: "user/message", seq: 1, time: 1, data: { content: [{ type: "text", text: "Hi" }] } } }], hasMore: false },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: { ok: true, value: values.shift() } })));
    const client = new DshApiClient("https://api.example.test", "test-token");

    await expect(client.listWorkspaces()).resolves.toMatchObject({ items: [{ workspaceId: "workspace-1" }] });
    await expect(client.loadHistory({ sessionId: "session-1", maxMessages: 50 })).resolves.toMatchObject({ events: [{ event: { type: "user/message", seq: 1 } }], hasMore: false });
  });

  it("propagates the selected sandbox scope on every DSH request", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(new URL(String(input)).searchParams.get("sandboxId")).toBe("sbx_00000000-0000-4000-8000-000000000001");
      return Response.json({ result: { ok: true, value: { items: [] } } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new DshApiClient("https://api.example.test", "test-token");
    client.setSandboxScope({ sandboxId: "sbx_00000000-0000-4000-8000-000000000001", workspaceId: "ws_00000000-0000-4000-8000-000000000001" });

    await client.listSessions();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves top-level and operation error codes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: "auth_required", message: "Authentication is required" } }), { status: 401 }))
      .mockResolvedValueOnce(Response.json({ result: { ok: false, error: { code: "title-invalid", message: "Title is invalid" } } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DshApiClient("https://api.example.test", "test-token");

    await expect(client.listSessions()).rejects.toMatchObject({ code: "auth_required", message: "Authentication is required" });
    await expect(client.renameSession({ sessionId: "session-1", title: "" })).rejects.toMatchObject({ code: "title-invalid", message: "Title is invalid" });
  });

  it("rejects malformed operation values before they reach the UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: { ok: true, value: { items: [{ sessionId: "session-1" }] } } })));

    await expect(new DshApiClient("https://api.example.test", "test-token").listSessions()).rejects.toBeInstanceOf(DshApiError);
  });

  it("requests a v1 ticket and passes only the opaque subprotocols to the socket factory", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.test/api/dsh/ws-ticket");
      expect(new URL(String(input)).search).toBe("");
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-token");
      expect(JSON.parse(String(init?.body))).toEqual({ sandboxId: "sbx_1", channel: "mux", sessionId: "session-1" });
      return Response.json({ ok: true, ticket: TICKET, expiresAt: Date.now() + 30_000, contractVersion: 1 });
    });
    vi.stubGlobal("fetch", vi.fn(() => { throw new Error("ambient fetch must not be used"); }));
    const factory = vi.fn(async (url: URL, protocols: readonly string[]) => {
      expect(url.toString()).toBe("wss://api.example.test/api/dsh/events.mux");
      expect(url.search).toBe("");
      expect(protocols).toEqual(["dsh.v1", `dsh-ticket.${TICKET}`]);
      return {} as WebSocket;
    });

    const socket = await new DshApiClient("https://api.example.test", { tokenProvider: () => "access-token", fetch: fetchMock }).openSocket({ sandboxId: "sbx_1", channel: "mux", sessionId: "session-1" }, factory);
    expect(socket).toBeDefined();
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledOnce();
  });

  it("uses the DSH host alias for host-channel tickets", async () => {
    const now = Date.now();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, ticket: TICKET, expiresAt: now + 30_000, contractVersion: 1 })));
    const factory = vi.fn(async (url: URL, protocols: readonly string[]) => {
      expect(url.toString()).toBe("wss://api.example.test/api/dsh/events.host");
      expect(protocols).toEqual(["dsh.v1", `dsh-ticket.${TICKET}`]);
      return {} as WebSocket;
    });

    await new DshApiClient("https://api.example.test", { tokenProvider: () => "access-token", now: () => now }).openSocket(
      { sandboxId: "sbx_1", channel: "host" },
      factory,
    );
    expect(factory).toHaveBeenCalledOnce();
  });

  it.each([
    { expiresAt: "2030-01-01T00:00:00.000Z", code: "expiresAt" },
    { contractVersion: 2, code: "contract" },
    { ticket: "bad ticket", code: "ticket" },
  ])("rejects invalid ticket response ($code)", async ({ expiresAt, contractVersion, ticket }) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, ticket: ticket ?? TICKET, expiresAt: expiresAt ?? Date.now() + 30_000, contractVersion: contractVersion ?? 1 })));
    await expect(new DshApiClient("https://api.example.test", "access-token").requestWebSocketTicket({ sandboxId: "sbx_1", channel: "host" })).rejects.toBeInstanceOf(DshApiError);
  });

  it("rejects tickets beyond the 60-second contract TTL", async () => {
    const now = Date.now();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, ticket: TICKET, expiresAt: now + 60_001, contractVersion: 1 })));
    const client = new DshApiClient("https://api.example.test", { tokenProvider: () => "access-token", now: () => now });
    await expect(client.requestWebSocketTicket({ sandboxId: "sbx_1", channel: "host" })).rejects.toMatchObject({ code: "ticket_expiry_invalid" });
  });
});
