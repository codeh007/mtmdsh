// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminAuthClient } from "../../config";
import { clearAdminApp, configureAdminApp } from "../../admin-fetch";
import { SystemConfigSurface } from "./system-config-surface";

const documentValue = { schemaVersion: 1, instance: { label: "main" }, secrets: {} };
const published = {
  createdAt: "2026-08-31T02:30:00.000Z",
  document: documentValue,
  revision: "config-11111111-1111-4111-8111-111111111111",
  scope: "gomtmui-system",
};
const auth = {
  getAccessToken: vi.fn(async () => "admin-access-token"),
  clear: vi.fn(),
} as unknown as AdminAuthClient;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" }, status });
}

function requestPath(input: RequestInfo | URL) {
  return new URL(String(input)).pathname;
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

describe("SystemConfigSurface", () => {
  it("loads and renders the current configuration document", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({ published }));
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemConfigSurface />);

    const textarea = (await screen.findByLabelText("System configuration JSON")) as HTMLTextAreaElement;
    expect(textarea.value).toBe(JSON.stringify(documentValue, null, 2));
    expect(screen.getByText(published.revision)).toBeTruthy();
    expect(requestPath(fetchMock.mock.calls[0]?.[0])).toBe("/api/system/config");
  });

  it("starts with a valid document when no revision exists", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ published: null })));

    render(<SystemConfigSurface />);

    const textarea = (await screen.findByLabelText("System configuration JSON")) as HTMLTextAreaElement;
    expect(JSON.parse(textarea.value)).toEqual({ schemaVersion: 1, instance: { label: "" }, secrets: {} });
    expect(screen.getByText("No configuration has been published yet.")).toBeTruthy();
  });

  it("publishes edited JSON with a bearer and displays the returned revision", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return jsonResponse({ published }, 201);
      return jsonResponse({ published: null });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<SystemConfigSurface />);
    const textarea = (await screen.findByLabelText("System configuration JSON")) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: JSON.stringify(documentValue) } });
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(await screen.findByText("Published " + published.revision)).toBeTruthy();
    const init = fetchMock.mock.calls[1]?.[1];
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer admin-access-token");
    expect(init?.body).toBe(JSON.stringify(documentValue));
  });

  it("renders translated controls and validation errors", async () => {
    document.documentElement.lang = "zh-CN";
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ published: null })));

    render(<SystemConfigSurface />);
    const textarea = (await screen.findByLabelText("系统配置 JSON")) as HTMLTextAreaElement;
    expect(screen.getByRole("button", { name: "发布" })).toBeTruthy();

    fireEvent.change(textarea, { target: { value: "{" } });
    fireEvent.click(screen.getByRole("button", { name: "发布" }));

    expect(await screen.findByText("配置 JSON 无效")).toBeTruthy();
  });

  it("translates a known system configuration API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: { code: "system_config_unavailable", message: "server text" } }, 500)),
    );

    render(<SystemConfigSurface />);

    expect(await screen.findByText("System configuration is unavailable")).toBeTruthy();
  });
});
