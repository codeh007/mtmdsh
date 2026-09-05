// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthClient, AdminAuthSnapshot } from "./config";

vi.mock("./components/admin/admin-control-plane-surface", () => ({
  AdminControlPlaneSurface: () => <div>control plane</div>,
}));

import { AdminAuthGate } from "./admin-auth";

function auth(snapshot: AdminAuthSnapshot): AdminAuthClient {
  return {
    getAccessToken: vi.fn(async () => "token"),
    getAccountPartition: () => undefined,
    subscribe: () => () => undefined,
    clear: vi.fn(),
    getSnapshot: () => snapshot,
    discover: vi.fn(),
    beginLogin: vi.fn(async () => "https://auth.example/authorize"),
    consumeCallback: vi.fn(async () => false),
    logout: vi.fn(async () => undefined),
    switchAccount: vi.fn(async () => "https://auth.example/authorize"),
    dispose: vi.fn(),
  } as unknown as AdminAuthClient;
}

afterEach(() => cleanup());

describe("AdminAuthGate", () => {
  it("renders the control plane only after bearer authentication", () => {
    render(<AdminAuthGate auth={auth({ status: "authenticated" })} />);
    expect(screen.getByText("control plane")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Sign in" })).toBeNull();
  });

  it("renders a sign-in action while signed out", () => {
    render(<AdminAuthGate auth={auth({ status: "signed-out" })} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    expect(screen.getByText("Administrator authentication is required.")).toBeTruthy();
  });
});
