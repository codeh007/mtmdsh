import { afterEach, describe, expect, it, vi } from "vitest";
import { SandboxApiClient, SandboxApiError, type SandboxRecord } from "./adapter";

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

afterEach(() => vi.restoreAllMocks());

describe("SandboxApiClient", () => {
  it("parses the owner-scoped catalog and sends a bearer token without cookies", async () => {
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.example.test/api/sandboxes");
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-token");
      return Response.json({ contractVersion: 1, sandboxes: [sandbox], defaultSandbox: sandbox, mountPolicy: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new SandboxApiClient("https://api.example.test/path", "test-token").listSandboxes()).resolves.toEqual({
      sandboxes: [sandbox],
      defaultSandbox: sandbox,
    });
  });

  it("selects a sandbox through the canonical default endpoint", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.method).toBe("PUT");
      expect(init?.headers).toMatchObject({ "content-type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual({ sandboxId: sandbox.id });
      return Response.json({ contractVersion: 1, sandbox, mountPolicy: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(new SandboxApiClient("https://api.example.test", "test-token").selectSandbox(sandbox.id)).resolves.toEqual(sandbox);
  });

  it("rejects malformed records and preserves server error codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ contractVersion: 1, sandboxes: [{ id: "bad" }], defaultSandbox: null, mountPolicy: [] }),
      ),
    );
    await expect(new SandboxApiClient("https://api.example.test", "test-token").listSandboxes()).rejects.toBeInstanceOf(
      SandboxApiError,
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          contractVersion: 1,
          sandboxes: [sandbox],
          defaultSandbox: sandbox,
          mountPolicy: [{ path: "/workspace" }],
        }),
      ),
    );
    await expect(new SandboxApiClient("https://api.example.test", "test-token").listSandboxes()).rejects.toMatchObject({
      code: "sandbox_invalid_response",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          contractVersion: 1,
          sandboxes: [{ ...sandbox, createdAt: "2026-01-01" }],
          defaultSandbox: sandbox,
          mountPolicy: [],
        }),
      ),
    );
    await expect(new SandboxApiClient("https://api.example.test", "test-token").listSandboxes()).rejects.toMatchObject({
      code: "sandbox_invalid_response",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ ok: false, error: { code: "sandbox_not_found", message: "Sandbox not found" } }),
            { status: 404 },
          ),
      ),
    );
    await expect(new SandboxApiClient("https://api.example.test", "test-token").selectSandbox(sandbox.id)).rejects.toMatchObject({
      code: "sandbox_not_found",
      status: 404,
    });
  });
});
