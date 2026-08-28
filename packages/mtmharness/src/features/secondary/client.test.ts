import { describe, expect, it, vi } from "vitest";
import { assertSecondaryManifest, type MtmSecondaryExtensionManifest } from "./manifest.ts";
import { loadSecondaryModule, MtmSecondaryClientRuntime } from "./client.ts";

const MANIFEST: MtmSecondaryExtensionManifest = {
  apiVersion: 1,
  id: "mtmcanvas",
  version: "0.2.0",
  clientUrl: "https://static.example.test/extensions/canvas.js",
  clientIntegrity: "sha256-" + "A".repeat(43) + "=",
};

function bench() {
  const cleanup = vi.fn();
  const mount = vi.fn(({ root }: { root: HTMLElement; registerCleanup: (cleanup: () => void | Promise<void>) => void }) => {
    root.textContent = "loaded";
    return cleanup;
  });
  const importer = vi.fn(async () => ({ mount }));
  const fetcher = vi.fn(async () => new Response("export function mount() {}", { status: 200 }));
  const runtime = new MtmSecondaryClientRuntime({
    document,
    fetch: fetcher,
    digest: async () => MANIFEST.clientIntegrity,
    importModule: importer,
  }, MANIFEST);
  return { cleanup, fetcher, importer, mount, runtime };
}

describe("secondary extension manifest", () => {
  it("accepts an exact HTTPS artifact on an arbitrary static host", () => {
    expect(() => assertSecondaryManifest(MANIFEST)).not.toThrow();
  });

  it.each([
    { clientUrl: "http://static.example.test/extensions/canvas.js", message: "HTTPS" },
    { clientUrl: "https://static.example.test/extensions/canvas.js#fragment", message: "HTTPS" },
    { clientIntegrity: "sha256-invalid", message: "sha256" },
    { apiVersion: 2, message: "API" },
  ])("rejects unsafe metadata", (patch) => {
    expect(() => assertSecondaryManifest({ ...MANIFEST, ...patch })).toThrow(patch.message);
  });

  it("rejects malformed input at the trust boundary", () => {
    expect(() => assertSecondaryManifest(null)).toThrow("manifest is invalid");
  });
});

describe("secondary ESM loading", () => {
  it("verifies bytes before importing the native module", async () => {
    const imported = vi.fn(async () => ({ mount() {} }));
    const fetcher = vi.fn(async () => new Response("export function mount() {}", { status: 200 }));
    await expect(loadSecondaryModule(MANIFEST, { fetch: fetcher, digest: async () => MANIFEST.clientIntegrity, importModule: imported })).resolves.toEqual({ mount: expect.any(Function) });
    expect(fetcher).toHaveBeenCalledWith(MANIFEST.clientUrl, { redirect: "error", signal: undefined });
    expect(imported).toHaveBeenCalledTimes(1);
  });

  it("does not import tampered bytes", async () => {
    const imported = vi.fn(async () => ({ mount() {} }));
    const fetcher = vi.fn(async () => new Response("tampered", { status: 200 }));
    await expect(loadSecondaryModule(MANIFEST, { fetch: fetcher, digest: async () => "sha256-" + "B".repeat(43) + "=", importModule: imported })).rejects.toThrow("integrity mismatch");
    expect(imported).not.toHaveBeenCalled();
  });

  it("imports a self-contained native ESM module", async () => {
    const fetcher = vi.fn(async () => new Response("export function mount() {}", { status: 200 }));
    const originalCreateObjectURL = URL.createObjectURL;
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: undefined });
    try {
      const extension = await loadSecondaryModule(MANIFEST, { fetch: fetcher, digest: async () => MANIFEST.clientIntegrity });
      expect(extension.mount).toEqual(expect.any(Function));
    } finally {
      Object.defineProperty(URL, "createObjectURL", { configurable: true, value: originalCreateObjectURL });
    }
  });

  it("does not import after cancellation during digest", async () => {
    let resolveDigest!: (value: string) => void;
    const digest = new Promise<string>((resolve) => { resolveDigest = resolve; });
    const imported = vi.fn(async () => ({ mount() {} }));
    const controller = new AbortController();
    const loading = loadSecondaryModule(MANIFEST, {
      fetch: async () => new Response("export function mount() {}", { status: 200 }),
      digest: async () => digest,
      importModule: imported,
    }, controller.signal);
    await Promise.resolve();
    controller.abort();
    resolveDigest(MANIFEST.clientIntegrity);
    await expect(loading).rejects.toMatchObject({ name: "AbortError" });
    expect(imported).not.toHaveBeenCalled();
  });

  it("rejects a module without the mount export", async () => {
    const fetcher = vi.fn(async () => new Response("export const value = 1", { status: 200 }));
    await expect(loadSecondaryModule(MANIFEST, { fetch: fetcher, digest: async () => MANIFEST.clientIntegrity, importModule: async () => ({}) })).rejects.toThrow("mount(context)");
  });
});

describe("secondary extension lifecycle", () => {
  it("mounts into an owned root and removes the root on disable", async () => {
    const state = bench();
    await state.runtime.setEnabled(true);
    expect(state.runtime.getSnapshot()).toEqual({ desired: true, status: "enabled" });
    expect(state.mount).toHaveBeenCalledWith(expect.objectContaining({ apiVersion: 1, id: MANIFEST.id, version: MANIFEST.version }));
    expect(document.querySelector("[data-mtm-secondary-extension=mtmcanvas]")?.textContent).toBe("loaded");

    await state.runtime.setEnabled(false);
    expect(state.runtime.getSnapshot()).toEqual({ desired: false, status: "disabled" });
    expect(state.cleanup).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-mtm-secondary-extension=mtmcanvas]")).toBeNull();
  });

  it("cleans up when mount fails", async () => {
    const state = bench();
    state.mount.mockImplementation(() => { throw new Error("mount failed"); });
    await state.runtime.setEnabled(true);
    expect(state.runtime.getSnapshot()).toEqual({ desired: true, status: "failed", error: "mount failed" });
    expect(document.querySelector("[data-mtm-secondary-extension=mtmcanvas]")).toBeNull();
  });

  it("runs registered cleanup when mount fails", async () => {
    const state = bench();
    const externalCleanup = vi.fn();
    state.mount.mockImplementation(({ registerCleanup }) => {
      registerCleanup(externalCleanup);
      throw new Error("mount failed after setup");
    });
    await state.runtime.setEnabled(true);
    expect(externalCleanup).toHaveBeenCalledOnce();
    expect(state.runtime.getSnapshot()).toMatchObject({ status: "failed", error: "mount failed after setup" });
  });

  it("aborts a pending fetch when disabled", async () => {
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn((_: string | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
      signal = init?.signal;
      signal?.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true });
    }));
    const runtime = new MtmSecondaryClientRuntime({ document, fetch: fetcher, digest: async () => MANIFEST.clientIntegrity, importModule: async () => ({ mount() {} }) }, MANIFEST);
    const enabling = runtime.setEnabled(true);
    await Promise.resolve();
    const disabling = runtime.setEnabled(false);
    await Promise.all([enabling, disabling]);
    expect(signal?.aborted).toBe(true);
    expect(runtime.getSnapshot()).toEqual({ desired: false, status: "disabled" });
  });

  it("coalesces rapid changes to the latest state", async () => {
    const state = bench();
    await Promise.all([state.runtime.setEnabled(true), state.runtime.setEnabled(false), state.runtime.setEnabled(true)]);
    expect(state.importer).toHaveBeenCalledOnce();
    expect(state.mount).toHaveBeenCalledOnce();
    expect(state.runtime.getSnapshot().status).toBe("enabled");
    await state.runtime.dispose();
  });

  it("retries a failed cleanup before reporting disabled", async () => {
    const state = bench();
    await state.runtime.setEnabled(true);
    state.cleanup.mockImplementationOnce(() => { throw new Error("transient cleanup failure"); });
    await state.runtime.setEnabled(false);
    expect(state.runtime.getSnapshot()).toMatchObject({ desired: false, status: "failed", error: "transient cleanup failure" });
    expect(document.querySelector("[data-mtm-secondary-extension=mtmcanvas]")).toBeNull();
    await state.runtime.setEnabled(false);
    expect(state.runtime.getSnapshot()).toEqual({ desired: false, status: "disabled" });
    expect(state.cleanup).toHaveBeenCalledTimes(2);
  });

  it("does not mount after disposal", async () => {
    const state = bench();
    await state.runtime.dispose();
    await state.runtime.setEnabled(true);
    expect(state.fetcher).not.toHaveBeenCalled();
    expect(state.runtime.getSnapshot()).toEqual({ desired: false, status: "disabled" });
  });
});
