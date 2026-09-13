import { afterEach, describe, expect, it, vi } from "vitest";
import { DshApiClient, DshApiError } from "./adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DshApiClient", () => {
  it("sends the official request envelope and derives session titles from projections", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        type: string;
        rpcId: string;
        method: string;
        payload: unknown;
      };
      expect(String(input)).toBe("https://api.example.test/api/session/list");
      expect(request).toMatchObject({
        type: "client-request",
        method: "session/list",
        payload: {},
      });
      return Response.json({
        type: "server-response",
        rpcId: request.rpcId,
        result: {
          ok: true,
          value: {
            items: [
              {
                sessionId: "session-1",
                updatedAt: 100,
                running: false,
                blank: false,
                cwd: "/workspace/project",
                projections: { asOfSeq: 4, values: { title: "Plan" } },
              },
            ],
          },
        },
      });
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        throw new Error("ambient fetch must not be used");
      }),
    );

    const result = await new DshApiClient("https://api.example.test/path", {
      tokenProvider: () => "test-token",
      fetch: fetchMock,
    }).listSessions();

    expect(result.items[0]).toMatchObject({
      sessionId: "session-1",
      title: "Plan",
      cwd: "/workspace/project",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts the official workspace and history result shapes", async () => {
    const values = [
      {
        items: [
          {
            workspaceId: "workspace-1",
            path: "/workspace",
            title: "workspace",
            sessionIds: ["session-1"],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        archivedSessionIds: [],
      },
      {
        events: [
          {
            event: {
              type: "user/message",
              seq: 1,
              time: 1,
              data: { content: [{ type: "text", text: "Hi" }] },
            },
          },
        ],
        hasMore: false,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { rpcId: string };
        return Response.json({
          type: "server-response",
          rpcId: request.rpcId,
          result: { ok: true, value: values.shift() },
        });
      }),
    );
    const client = new DshApiClient("https://api.example.test", "test-token");

    await expect(client.listWorkspaces()).resolves.toMatchObject({
      items: [{ workspaceId: "workspace-1" }],
    });
    await expect(
      client.loadHistory({ sessionId: "session-1", maxMessages: 50 }),
    ).resolves.toMatchObject({
      events: [{ event: { type: "user/message", seq: 1 } }],
      hasMore: false,
    });
  });

  it("propagates the selected sandbox scope on every DSH request", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(new URL(String(input)).searchParams.get("sandboxId")).toBe(
        "sbx_00000000-0000-4000-8000-000000000001",
      );
      return Response.json({
        type: "server-response",
        rpcId: (JSON.parse(String(init?.body)) as { rpcId: string }).rpcId,
        result: { ok: true, value: { items: [] } },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new DshApiClient("https://api.example.test", "test-token");
    client.setSandboxScope({
      sandboxId: "sbx_00000000-0000-4000-8000-000000000001",
      workspaceId: "ws_00000000-0000-4000-8000-000000000001",
    });

    await client.listSessions();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("preserves top-level and operation error codes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "auth_required",
              message: "Authentication is required",
            },
          }),
          { status: 401 },
        ),
      )
      .mockImplementationOnce(async (_input, init) =>
        Response.json({
          type: "server-response",
          rpcId: (JSON.parse(String(init?.body)) as { rpcId: string }).rpcId,
          result: {
            ok: false,
            error: {
              code: "title-invalid",
              message: "Title is invalid",
              details: {},
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const client = new DshApiClient("https://api.example.test", "test-token");

    await expect(client.listSessions()).rejects.toMatchObject({
      code: "auth_required",
      message: "Authentication is required",
    });
    await expect(
      client.renameSession({ sessionId: "session-1", title: "" }),
    ).rejects.toMatchObject({
      code: "title-invalid",
      message: "Title is invalid",
    });
  });

  it("rejects malformed response envelopes and rpcId mismatches", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as { rpcId: string };
        return Response.json({
          type: "server-response",
          rpcId: request.rpcId + "-wrong",
          result: { ok: true, value: { items: [] } },
        });
      },
    );
    const client = new DshApiClient("https://api.example.test", {
      tokenProvider: () => "test-token",
      fetch: fetchMock,
    });

    await expect(client.listSessions()).rejects.toMatchObject({
      message: "The server returned a mismatched response.rpcId",
    });

    fetchMock.mockImplementationOnce(async () =>
      Response.json({
        rpcId: "missing-type",
        result: { ok: true, value: { items: [] } },
      }),
    );
    await expect(client.listSessions()).rejects.toMatchObject({
      message: "The server returned an invalid response.type",
    });
  });

  it("requires structured operation errors", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as { rpcId: string };
        return Response.json({
          type: "server-response",
          rpcId: request.rpcId,
          result: {
            ok: false,
            error: { code: "unavailable", message: "Unavailable" },
          },
        });
      },
    );

    await expect(
      new DshApiClient("https://api.example.test", {
        tokenProvider: () => "test-token",
        fetch: fetchMock,
      }).listSessions(),
    ).rejects.toMatchObject({
      message: "The server returned an invalid operation error.details",
    });
  });

  it("rejects malformed operation values before they reach the UI", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input, init) => {
        const request = JSON.parse(String(init?.body)) as { rpcId: string };
        return Response.json({
          type: "server-response",
          rpcId: request.rpcId,
          result: { ok: true, value: { items: [{ sessionId: "session-1" }] } },
        });
      }),
    );

    await expect(
      new DshApiClient("https://api.example.test", "test-token").listSessions(),
    ).rejects.toBeInstanceOf(DshApiError);
  });

  it("reports unavailable WebSocket transport without using a legacy endpoint", async () => {
    const client = new DshApiClient("https://api.example.test", "access-token");
    await expect(
      client.openSocket({ sandboxId: "sbx_1", channel: "mux" }),
    ).rejects.toMatchObject({ code: "websocket_unavailable" });
  });
});
