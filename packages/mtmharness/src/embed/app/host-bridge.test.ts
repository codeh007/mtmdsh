import { afterEach, describe, expect, it, vi } from "vitest";
import { LAUNCHER_CONTRACT_VERSION, installHostBridge } from "./host-bridge";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.lang = "en";
  vi.restoreAllMocks();
});

describe("installHostBridge", () => {
  it("requires source, origin, nonce, and version before accepting messages", () => {
    const postMessage = vi.fn();
    const parent = { postMessage } as unknown as Window;
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const bridge = installHostBridge({ window, parentWindow: parent, allowedParentOrigins: ["https://host.example.test"], onOpen, onClose });
    const nonce = "n".repeat(32);
    const dispatch = (source: Window, origin: string, data: unknown): void => {
      window.dispatchEvent(new MessageEvent("message", { source, origin, data }));
    };

    dispatch(parent, "https://evil.example.test", { type: "hello", contractVersion: LAUNCHER_CONTRACT_VERSION, nonce });
    dispatch(parent, "https://host.example.test", { type: "hello", contractVersion: 2, nonce });
    expect(postMessage).not.toHaveBeenCalled();

    dispatch(parent, "https://host.example.test", { type: "hello", contractVersion: LAUNCHER_CONTRACT_VERSION, nonce });
    expect(postMessage).toHaveBeenCalledWith({ type: "ready", contractVersion: 1, nonce }, "https://host.example.test");
    dispatch(parent, "https://host.example.test", { type: "hello", contractVersion: LAUNCHER_CONTRACT_VERSION, nonce: "m".repeat(32) });
    expect(postMessage).toHaveBeenCalledOnce();

    dispatch(window, "https://host.example.test", { type: "open", contractVersion: 1, nonce });
    dispatch(parent, "https://host.example.test", { type: "open", contractVersion: 1, nonce: "wrong" });
    dispatch(parent, "https://host.example.test", { type: "open", contractVersion: 1, nonce });
    expect(onOpen).toHaveBeenCalledOnce();

    dispatch(parent, "https://host.example.test", { type: "theme", contractVersion: 1, nonce, value: "dark" });
    dispatch(parent, "https://host.example.test", { type: "locale", contractVersion: 1, nonce, value: "zh-CN" });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.lang).toBe("zh-CN");

    bridge.send("resize", { height: 500 });
    expect(postMessage).toHaveBeenLastCalledWith({ type: "resize", contractVersion: 1, nonce, height: 500 }, "https://host.example.test");
    dispatch(parent, "https://host.example.test", { type: "close", contractVersion: 1, nonce });
    expect(onClose).toHaveBeenCalledOnce();
    bridge.dispose();
    dispatch(parent, "https://host.example.test", { type: "open", contractVersion: 1, nonce });
    expect(onOpen).toHaveBeenCalledOnce();
  });
});
