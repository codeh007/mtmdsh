import { afterEach, describe, expect, it, vi } from "vitest";
import { DshApiClient, DshApiError } from "./adapter";

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
    vi.stubGlobal("fetch", fetchMock);

    const result = await new DshApiClient("https://api.example.test/path").listSessions();

    expect(result.items[0]).toMatchObject({ sessionId: "session-1", title: "Plan", cwd: "/workspace/project" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts the official workspace and history result shapes", async () => {
    const values = [
      { items: [{ workspaceId: "workspace-1", path: "/workspace", title: "workspace", sessionIds: ["session-1"], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }], archivedSessionIds: [] },
      { events: [{ event: { type: "user/message", seq: 1, time: 1, data: { content: [{ type: "text", text: "Hi" }] } } }], hasMore: false },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: { ok: true, value: values.shift() } })));
    const client = new DshApiClient("https://api.example.test");

    await expect(client.listWorkspaces()).resolves.toMatchObject({ items: [{ workspaceId: "workspace-1" }] });
    await expect(client.loadHistory({ sessionId: "session-1", maxMessages: 50 })).resolves.toMatchObject({ events: [{ event: { type: "user/message", seq: 1 } }], hasMore: false });
  });

  it("propagates the selected sandbox scope on every DSH request", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      expect(new URL(String(input)).searchParams.get("sandboxId")).toBe("sbx_00000000-0000-4000-8000-000000000001");
      return Response.json({ result: { ok: true, value: { items: [] } } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new DshApiClient("https://api.example.test");
    client.setSandboxScope({ sandboxId: "sbx_00000000-0000-4000-8000-000000000001", workspaceId: "ws_00000000-0000-4000-8000-000000000001" });

    await client.listSessions();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves top-level and operation error codes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, error: { code: "auth_required", message: "Authentication is required" } }), { status: 401 }))
      .mockResolvedValueOnce(Response.json({ result: { ok: false, error: { code: "title-invalid", message: "Title is invalid" } } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DshApiClient("https://api.example.test");

    await expect(client.listSessions()).rejects.toMatchObject({ code: "auth_required", message: "Authentication is required" });
    await expect(client.renameSession({ sessionId: "session-1", title: "" })).rejects.toMatchObject({ code: "title-invalid", message: "Title is invalid" });
  });

  it("rejects malformed operation values before they reach the UI", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ result: { ok: true, value: { items: [{ sessionId: "session-1" }] } } })));

    await expect(new DshApiClient("https://api.example.test").listSessions()).rejects.toBeInstanceOf(DshApiError);
  });
});
