// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthClient } from "../../config";
import { clearAdminApp, configureAdminApp } from "../../admin-fetch";
import { P2PBootstrapSurface } from "./p2p-bootstrap-surface";

const initialSnapshot = {
  node_id: "12D3KooWBootstrap",
  revision: 1,
  generation: 1,
  capabilities: ["config.snapshot.v1"],
  services: ["mock.execution-world"],
  data: { mode: "mock", status: "ready" },
};
const auth = {
  getAccessToken: vi.fn(async () => "admin-access-token"),
  clear: vi.fn(),
} as unknown as AdminAuthClient;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

beforeEach(() => {
  configureAdminApp({ apiOrigin: "https://authority.example", auth });
});

afterEach(() => {
  cleanup();
  clearAdminApp(auth);
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("P2PBootstrapSurface", () => {
  it("loads the bootstrap address and saves an edited snapshot with a bearer", async () => {
    const savedSnapshot = {
      ...initialSnapshot,
      capabilities: ["config.snapshot.v1", "config.snapshot.v2"],
      revision: 2,
      generation: 2,
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path === "/p2p/bootstrap") {
        return jsonResponse({
          peer_id: initialSnapshot.node_id,
          multiaddr: "/dns4/gomtm-dev.yuepa8.com/tcp/443/wss/p2p/" + initialSnapshot.node_id,
          protocols: ["/gomtm/config/1.0.0"],
          connections: [],
          snapshot: initialSnapshot,
          websocket_mode: "standard",
        });
      }
      expect(path).toBe("/api/system/p2p/bootstrap/config");
      expect(init?.method).toBe("PUT");
      expect(init?.body).toContain("config.snapshot.v2");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer admin-access-token");
      return jsonResponse(savedSnapshot);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<P2PBootstrapSurface />);

    expect(await screen.findByText(initialSnapshot.node_id)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Capabilities (one per line)"), {
      target: { value: "config.snapshot.v1\nconfig.snapshot.v2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save snapshot" }));

    expect(await screen.findByText("Snapshot saved")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
