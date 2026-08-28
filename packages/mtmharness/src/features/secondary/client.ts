/**
 * mtmharness-owned loader for trusted browser frontend extensions.
 *
 * Extensions use a small mount/cleanup contract and never receive DSH internals.
 * The artifact is fetched as bytes so the host can verify SHA-256 before importing
 * it as native ESM; the release must therefore publish a self-contained bundle.
 */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import { assertSecondaryManifest, MTM_CANVAS_EXTENSION, type MtmSecondaryExtensionManifest } from "./manifest.js";
export { assertSecondaryManifest } from "./manifest.js";

/** Stable browser ABI exposed to a secondary extension. */
export interface MtmharnessFrontendExtensionContext {
  readonly apiVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly root: HTMLElement;
  readonly document: Document;
  readonly signal: AbortSignal;
  readonly registerCleanup: (cleanup: () => void | Promise<void>) => void;
}

export type MtmharnessFrontendExtensionCleanup = void | (() => void | Promise<void>);

/** Native ESM module shape required from a secondary artifact. */
export interface MtmharnessFrontendExtension {
  mount(context: MtmharnessFrontendExtensionContext): MtmharnessFrontendExtensionCleanup | Promise<MtmharnessFrontendExtensionCleanup>;
}

export interface MtmSecondarySnapshot {
  readonly desired: boolean;
  readonly status: "disabled" | "loading" | "enabled" | "failed";
  readonly error?: string;
}

/** Injectable network/import seams used by focused lifecycle tests. */
export interface MtmSecondaryClientOptions {
  readonly document?: Document;
  readonly fetch?: typeof fetch;
  readonly importModule?: (url: string) => Promise<unknown>;
  readonly digest?: (bytes: Uint8Array) => Promise<string>;
}

type Cleanup = () => void | Promise<void>;

type SecondarySettingsScope = {
  getSnapshot(): { value?: { dynamicCanvasEnabled?: boolean } };
  subscribe(listener: () => void): () => void;
};

type SecondarySettingsBinder = {
  bind<T>(spec: { namespace: string }): SecondarySettingsScope & { getSnapshot(): { value?: T } };
};

const MAX_ARTIFACT_BYTES = 2_000_000;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw signal.reason ?? new DOMException("secondary extension load was cancelled", "AbortError");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) throw new Error("secondary extension SHA-256 is unavailable");
  const digest = new Uint8Array(await subtle.digest("SHA-256", bytes.buffer as ArrayBuffer));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return "sha256-" + btoa(binary);
}

function extensionExports(value: unknown): MtmharnessFrontendExtension {
  const mount = typeof value === "object" && value !== null ? (value as { mount?: unknown }).mount : undefined;
  if (typeof mount !== "function") throw new Error("secondary client artifact must export mount(context)");
  return { mount: mount as MtmharnessFrontendExtension["mount"] };
}

/** Fetch, verify, and import one self-contained native ESM artifact. */
export async function loadSecondaryModule(
  manifest: MtmSecondaryExtensionManifest,
  options: MtmSecondaryClientOptions = {},
  signal?: AbortSignal,
): Promise<MtmharnessFrontendExtension> {
  assertSecondaryManifest(manifest);
  throwIfAborted(signal);
  const fetcher = options.fetch ?? globalThis.fetch;
  const response = await fetcher(manifest.clientUrl, { redirect: "error", signal });
  if (!response.ok) throw new Error("secondary client artifact returned HTTP " + response.status);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_ARTIFACT_BYTES) throw new Error("secondary client artifact size is invalid");
  const bytes = new Uint8Array(await response.arrayBuffer());
  throwIfAborted(signal);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error("secondary client artifact size is invalid");
  const integrity = await (options.digest ?? sha256)(bytes);
  throwIfAborted(signal);
  if (integrity !== manifest.clientIntegrity) throw new Error("secondary client artifact integrity mismatch");

  const source = new TextDecoder().decode(bytes);
  const importModule = options.importModule ?? ((url: string) => import(/* @vite-ignore */ url));
  if (typeof URL.createObjectURL !== "function" || typeof URL.revokeObjectURL !== "function") {
    throwIfAborted(signal);
    return extensionExports(await importModule("data:text/javascript;charset=utf-8," + encodeURIComponent(source)));
  }
  const sourceUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    throwIfAborted(signal);
    // Dynamic import has no cancellation API; the checkpoint prevents starting it after abort.
    return extensionExports(await importModule(sourceUrl));
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/** Load and unload one trusted frontend artifact with serialized transitions. */
export class MtmSecondaryClientRuntime {
  private readonly listeners = new Set<() => void>();
  private snapshot: MtmSecondarySnapshot = { desired: false, status: "disabled" };
  private desired = false;
  private root: HTMLDivElement | undefined;
  private cleanup: Cleanup | undefined;
  private loadAbort: AbortController | undefined;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly options: MtmSecondaryClientOptions = {},
    private readonly manifest: MtmSecondaryExtensionManifest = MTM_CANVAS_EXTENSION,
  ) {
    assertSecondaryManifest(manifest);
  }

  getSnapshot = (): MtmSecondarySnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  setEnabled(enabled: boolean): Promise<void> {
    if (this.disposed) return Promise.resolve();
    this.desired = enabled;
    if (!enabled) this.loadAbort?.abort();
    const operation = this.queue.then(() => this.reconcile());
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  show(focusSelector?: string): void {
    const root = this.root;
    if (root === undefined) return;
    root.hidden = false;
    if (focusSelector !== undefined) root.querySelector<HTMLElement>(focusSelector)?.focus();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.desired = false;
    this.loadAbort?.abort();
    await this.queue;
    try {
      await this.unload();
    } finally {
      this.publish({ desired: false, status: "disabled" });
      this.listeners.clear();
    }
  }

  private async reconcile(): Promise<void> {
    if (this.disposed) return;
    if (!this.desired) {
      try {
        await this.unload();
        this.publish({ desired: false, status: "disabled" });
      } catch (error) {
        this.publish({ desired: false, status: "failed", error: errorText(error) });
      }
      return;
    }
    if (this.root !== undefined) return;
    try {
      await this.load();
      if (!this.disposed && this.desired && this.root !== undefined) this.publish({ desired: true, status: "enabled" });
    } catch (error) {
      try {
        await this.unload();
      } catch (cleanupError) {
        error = new AggregateError([error, cleanupError], "secondary client load cleanup failed");
      }
      if (this.disposed || !this.desired || isAbortError(error)) return;
      this.publish({ desired: true, status: "failed", error: errorText(error) });
    }
  }

  private async load(): Promise<void> {
    this.publish({ desired: true, status: "loading" });
    const doc = this.options.document ?? (typeof document === "undefined" ? undefined : document);
    if (doc?.body === null || doc === undefined) throw new Error("secondary extension document body is unavailable");
    const controller = new AbortController();
    this.loadAbort = controller;
    try {
      const extension = await loadSecondaryModule(this.manifest, this.options, controller.signal);
      if (this.disposed || !this.desired) return;
      const root = doc.createElement("div");
      root.dataset.mtmSecondaryExtension = this.manifest.id;
      doc.body.append(root);
      this.root = root;
      const registeredCleanups: Cleanup[] = [];
      let returnedCleanup: Cleanup | undefined;
      let acceptingCleanups = true;
      const registerCleanup = (cleanup: Cleanup): void => {
        if (typeof cleanup !== "function") throw new Error("secondary extension cleanup must be a function");
        if (!acceptingCleanups) throw new Error("secondary extension cleanup registration is closed");
        registeredCleanups.push(cleanup);
      };
      const cleanupAll: Cleanup = async () => {
        acceptingCleanups = false;
        let failed = false;
        let failure: unknown;
        if (returnedCleanup !== undefined) {
          try {
            await returnedCleanup();
            returnedCleanup = undefined;
          } catch (error) {
            failed = true;
            failure = error;
          }
        }
        for (let index = registeredCleanups.length - 1; index >= 0; index -= 1) {
          try {
            await registeredCleanups[index]!();
            registeredCleanups.splice(index, 1);
          } catch (error) {
            failed = true;
            failure ??= error;
          }
        }
        if (failed) throw failure;
      };
      this.cleanup = cleanupAll;
      const mountedCleanup = await extension.mount({
        apiVersion: this.manifest.apiVersion,
        id: this.manifest.id,
        version: this.manifest.version,
        root,
        document: doc,
        signal: controller.signal,
        registerCleanup,
      });
      if (typeof mountedCleanup === "function") returnedCleanup = mountedCleanup;
      else if (mountedCleanup !== undefined) throw new Error("secondary extension mount must return a cleanup function");
      acceptingCleanups = false;
      if (this.disposed || !this.desired) await this.unload();
    } finally {
      if (this.loadAbort === controller) this.loadAbort = undefined;
    }
  }

  private async unload(): Promise<void> {
    const cleanup = this.cleanup;
    const root = this.root;
    try {
      if (cleanup !== undefined) await cleanup();
    } finally {
      root?.remove();
    }
    this.cleanup = undefined;
    this.root = undefined;
  }

  private publish(next: MtmSecondarySnapshot): void {
    this.snapshot = next;
    for (const listener of [...this.listeners]) listener();
  }
}

/** Mount the Canvas secondary extension under the primary mtmharness client fiber. */
export function apply(ctx: ClientContext): void {
  const settingsScope = ctx.settingsScope as SecondarySettingsBinder | undefined;
  if (settingsScope === undefined) throw new Error("mtmharness: secondary settings service is unavailable");
  const settings = settingsScope.bind<{ dynamicCanvasEnabled?: boolean }>({ namespace: "mtm-coding" });
  const runtime = new MtmSecondaryClientRuntime({ document: typeof document === "undefined" ? undefined : document });
  const reconcile = (): void => {
    void runtime.setEnabled(settings.getSnapshot().value?.dynamicCanvasEnabled === true);
  };
  const unsubscribe = settings.subscribe(reconcile);
  reconcile();
  ctx.effect(() => async () => {
    unsubscribe();
    await runtime.dispose();
  }, "mtmharness: secondary extension lifecycle");
}

export const inject = ["settingsScope"];
