// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthClient } from "./config";
import { adminFetch, adminUrl, clearAdminApp, configureAdminApp } from "./admin-fetch";

const auth = {
  getAccessToken: vi.fn(async () => "admin-access-token"),
  getAccountPartition: () => undefined,
  subscribe: () => () => undefined,
  clear: vi.fn(),
  getSnapshot: () => ({ status: "authenticated" as const }),
  discover: vi.fn(),
  beginLogin: vi.fn(),
  consumeCallback: vi.fn(),
  logout: vi.fn(),
  switchAccount: vi.fn(),
  dispose: vi.fn(),
} as unknown as AdminAuthClient;

afterEach(() => {
  clearAdminApp(auth);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  auth.getAccessToken.mockClear();
  auth.clear.mockClear();
});

describe("mtm-admin API boundary", () => {
  it("resolves requests against the configured API origin", () => {
    configureAdminApp({ apiOrigin: "https://authority.example", auth });
    expect(adminUrl("/api/system/auth")).toBe("https://authority.example/api/system/auth");
  });

  it("sends the OAuth bearer without cookies", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    configureAdminApp({ apiOrigin: "https://authority.example", auth });

    await adminFetch("/api/system/auth", { headers: { accept: "application/json" }, method: "PUT" });

    const [input, init] = fetchMock.mock.calls[0] ?? [];
    expect(input).toBe("https://authority.example/api/system/auth");
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer admin-access-token");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
  });

  it("clears the token source after an unauthorized response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 401 })));
    configureAdminApp({ apiOrigin: "https://authority.example", auth });

    await adminFetch("/api/system/auth");

    expect(auth.clear).toHaveBeenCalledOnce();
  });
});
