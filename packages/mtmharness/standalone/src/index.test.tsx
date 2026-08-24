import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeConfig } from "@/app/config";
import { MtmHarnessClient, mount } from "./index";
import { applySessionEvent, foldHistory } from "./runtime";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
  document.documentElement.classList.remove("dark");
  window.history.replaceState({}, "", "/");
  vi.unstubAllGlobals();
});

describe("mtmharness embed runtime", () => {
  it("mounts into an isolated shadow root and removes itself on unmount", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    let handle: ReturnType<typeof mount> | undefined;
    await act(async () => {
      handle = mount({ target, apiOrigin: "https://api.example.test", accessToken: "token" });
    });
    const host = target.querySelector("[data-mtmharness]");
    expect(host).not.toBeNull();
    expect(host?.shadowRoot?.querySelector("style")).toBeInstanceOf(HTMLStyleElement);
    expect(host?.shadowRoot?.querySelector("button[aria-label=\"Open MTM Harness conversation\"]")).not.toBeNull();
    await act(async () => { handle?.unmount(); });
    expect(target.querySelector("[data-mtmharness]")).toBeNull();
  });

  it("keeps multiple mounts and host history independent", async () => {
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const handles: ReturnType<typeof mount>[] = [];
    await act(async () => {
      handles.push(mount({ target: first, apiOrigin: "https://one.example.test", accessToken: "one" }));
      handles.push(mount({ target: second, apiOrigin: "https://two.example.test", accessToken: "two" }));
    });
    expect(first.querySelector("[data-mtmharness]")?.shadowRoot).not.toBe(second.querySelector("[data-mtmharness]")?.shadowRoot);
    expect(window.location.pathname).toBe("/");
    await act(async () => { handles.forEach((handle) => handle.unmount()); });
  });

  it("does not expose cookie or anonymous-auth controls", async () => {
    const target = document.createElement("div");
    document.body.append(target);
    const response = new Response(JSON.stringify({ error: { code: "auth_required", message: "Authentication is required" } }), { status: 401, headers: { "content-type": "application/json" } });
    vi.stubGlobal("fetch", vi.fn(async () => response.clone()));
    let handle: ReturnType<typeof mount> | undefined;
    await act(async () => {
      handle = mount({ target, apiOrigin: "https://api.example.test", accessToken: "token", mode: "dialog" });
      await Promise.resolve();
    });
    const button = target.querySelector("[data-mtmharness]")?.shadowRoot?.querySelector("button[aria-label=\"Open MTM Harness conversation\"]") as HTMLButtonElement;
    await act(async () => { button.click(); await Promise.resolve(); });
    const shadowRoot = target.querySelector("[data-mtmharness]")?.shadowRoot;
    const text = shadowRoot?.textContent ?? "";
    expect(text).not.toContain("Continue anonymously");
    expect(text).not.toContain("Sign up");
    expect(shadowRoot?.querySelector("a[href*='/auth/']")).toBeNull();
    expect((vi.mocked(fetch) as unknown as { mock: { calls: Array<[string | URL]> } }).mock.calls.some(([url]) => String(url).includes("/api/auth/"))).toBe(false);
    await act(async () => { handle?.unmount(); });
  });

  it("auto-mounts from a script with an explicit token", async () => {
    const script = document.createElement("script");
    script.dataset.apiOrigin = "https://api.example.test";
    script.dataset.accessToken = "script-token";
    script.dataset.mode = "fullscreen";
    document.body.append(script);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "auth_required", message: "Authentication is required" } }), { status: 401 })));
    let handle: ReturnType<typeof mount> | null = null;
    await act(async () => {
      handle = MtmHarnessClient.autoMount(script);
      await Promise.resolve();
    });
    expect(script.dataset.mtmharnessMounted).toBe("true");
    expect(document.querySelector("[data-mtmharness]")).not.toBeNull();
    await act(async () => { handle?.unmount(); });
  });

  it("normalizes origins and keeps token configuration explicit", () => {
    expect(normalizeConfig({ apiOrigin: "https://api.example.test/path", accessToken: "  token  " })).toEqual({
      apiOrigin: "https://api.example.test",
      accessToken: "token",
      mode: "floating",
    });
    expect(() => normalizeConfig({ apiOrigin: "https://api.example.test", accessToken: "  " })).toThrow("accessToken must not be empty");
  });

  it("folds streamed assistant text into the final assistant message", () => {
    let messages = applySessionEvent([], { type: "assistant/chunk", data: { turn: 1, step: 1, chunk: { type: "text-delta", text: "Hello" } } });
    messages = applySessionEvent(messages, { type: "assistant/chunk", data: { turn: 1, step: 1, chunk: { type: "text-delta", text: " world" } } });
    messages = applySessionEvent(messages, { type: "assistant/message", seq: 3, data: { turn: 1, step: 1, message: { id: "assistant-1", content: [{ type: "text", text: "Hello world" }] } } });
    expect(messages).toEqual([{ id: "assistant-1", role: "assistant", text: "Hello world" }]);
  });

  it("loads visible messages from history", () => {
    expect(foldHistory([
      { event: { type: "user/message", seq: 1, data: { id: "user-1", content: [{ type: "text", text: "Hi" }] } } },
      { event: { type: "assistant/message", seq: 2, data: { turn: 1, step: 1, message: { id: "assistant-1", content: [{ type: "text", text: "Hello" }] } } } },
    ])).toEqual([{ id: "user-1", role: "user", text: "Hi" }, { id: "assistant-1", role: "assistant", text: "Hello" }]);
  });

  it("publishes the browser API", () => {
    expect(window.MtmHarnessClient).toBe(MtmHarnessClient);
  });
});
