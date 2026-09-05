// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthClient } from "../../config";
import { clearAdminApp, configureAdminApp } from "../../admin-fetch";
import { AdminControlPlaneSurface } from "./admin-control-plane-surface";

vi.mock("../system-config/system-config-surface", () => ({
  SystemConfigSurface: () => <section>system config surface</section>,
}));

vi.mock("./p2p-bootstrap-surface", () => ({
  P2PBootstrapSurface: () => <section>p2p bootstrap surface</section>,
}));

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

const authConfig = {
  emailVerificationAvailable: false,
  emailVerificationEnabled: false,
  github: { clientId: "", enabled: false, secretConfigured: false },
  memberSignupEnabled: false,
};
const auth = {
  getAccessToken: vi.fn(async () => "admin-access-token"),
  clear: vi.fn(),
} as unknown as AdminAuthClient;

beforeEach(() => {
  configureAdminApp({ apiOrigin: "https://authority.example", auth });
});

afterEach(() => {
  cleanup();
  clearAdminApp(auth);
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("AdminControlPlaneSurface", () => {
  it("loads authentication controls with the Admin bearer", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(new URL(String(input)).pathname).toBe("/api/system/auth");
      expect(init?.credentials).toBe("omit");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer admin-access-token");
      return jsonResponse({ config: authConfig });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AdminControlPlaneSurface />);

    expect(await screen.findByText("system config surface")).toBeTruthy();
    expect(screen.getByText("Authentication")).toBeTruthy();
    expect(screen.getByText("Member registration")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("renders the selected locale for admin controls", async () => {
    document.documentElement.lang = "zh-CN";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.credentials).toBe("omit");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer admin-access-token");
        return jsonResponse({ config: authConfig });
      }),
    );

    render(<AdminControlPlaneSurface />);

    expect(await screen.findByText("认证")).toBeTruthy();
    expect(screen.getByText("成员注册")).toBeTruthy();
  });
});
