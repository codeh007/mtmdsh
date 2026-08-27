import { useEffect, useRef, useSyncExternalStore, type ReactElement } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { closeMtmHarnessLauncher, openMtmHarnessLauncher, publish, snapshot, subscribe, type LauncherState } from "./launcher-state.js";

export const MTM_HARNESS_LAUNCHER_APP_URL = "https://unpkg.com/mtmharness@latest/dist/standalone/index.html";
export const MTM_HARNESS_LAUNCHER_APP_ORIGIN = "https://unpkg.com";
export const MTM_HARNESS_LAUNCHER_CONTRACT_VERSION = 1 as const;
/** The launcher follows the package CDN's latest stable release. */
export const MTM_HARNESS_LAUNCHER_READY = true;

const LAUNCHER_MESSAGE_TYPES = ["ready", "close", "resize"] as const;
type LauncherMessageType = (typeof LAUNCHER_MESSAGE_TYPES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMessage(value: unknown, type: LauncherMessageType, nonce: string): boolean {
  return isRecord(value) && value.type === type && value.contractVersion === MTM_HARNESS_LAUNCHER_CONTRACT_VERSION && value.nonce === nonce;
}

function send(frame: HTMLIFrameElement, type: "hello" | "open" | "close" | "theme" | "locale", nonce: string): void {
  frame.contentWindow?.postMessage({ type, contractVersion: MTM_HARNESS_LAUNCHER_CONTRACT_VERSION, nonce, ...(type === "theme" ? { value: document.documentElement.classList.contains("dark") ? "dark" : "light" } : {}), ...(type === "locale" ? { value: document.documentElement.lang || navigator.language } : {}) }, MTM_HARNESS_LAUNCHER_APP_ORIGIN);
}

export type MtmHarnessLauncherActionProps = PropsRuntime<"sidebar.footer.action">;

export function MtmHarnessLauncherAction({ wide }: MtmHarnessLauncherActionProps): ReactElement {
  const current: LauncherState = useSyncExternalStore(subscribe, snapshot, snapshot);
  const label = MTM_HARNESS_LAUNCHER_READY ? "Open MTM cloud workspace" : "MTM Cloud is not deployed";
  return (
    <Button
      className={wide ? "mtm-trigger mtm-launcher-trigger-wide" : "mtm-trigger mtm-launcher-trigger-rail"}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={current.open}
      title={label}
      disabled={!MTM_HARNESS_LAUNCHER_READY}
      variant="ghost"
      size={wide ? "md" : "sm"}
      onClick={openMtmHarnessLauncher}
    >
      {wide ? "MTM Cloud" : "MTM"}
    </Button>
  );
}

export function MtmHarnessLauncherOverlay(): ReactElement | null {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot) as LauncherState;
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!current.open || current.nonce === undefined) return;
    const nonce = current.nonce;
    const onMessage = (event: MessageEvent): void => {
      const frame = frameRef.current;
      if (frame === null || event.source !== frame.contentWindow || event.origin !== MTM_HARNESS_LAUNCHER_APP_ORIGIN || !isRecord(event.data)) return;
      if (isMessage(event.data, "ready", nonce)) {
        publish({ ...snapshot(), ready: true, error: undefined });
        send(frame, "open", nonce);
        send(frame, "theme", nonce);
        send(frame, "locale", nonce);
        return;
      }
      if (isMessage(event.data, "close", nonce)) {
        closeMtmHarnessLauncher();
        return;
      }
      if (isMessage(event.data, "resize", nonce)) {
        const height = event.data.height;
        if (typeof height === "number" && Number.isFinite(height)) publish({ ...snapshot(), height: Math.max(320, Math.min(900, Math.round(height))) });
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); };
  }, [current.open, current.nonce]);

  if (!current.open || current.nonce === undefined) return null;
  const nonce = current.nonce;
  return (
    <div data-mtmharness-launcher="true" className="pointer-events-none fixed inset-0 z-[2147483000]">
      <dialog open className="pointer-events-auto absolute right-4 bottom-4 m-0 flex w-[min(52rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-border bg-background p-0 shadow-2xl sm:right-6 sm:bottom-6" style={{ height: current.height }} aria-label="MTM cloud workspace">
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-border border-b bg-card px-3">
          <strong className="truncate text-sm">MTM Cloud</strong>
          <Button type="button" variant="ghost" size="sm" aria-label="Close MTM cloud workspace" title="Close MTM cloud workspace" onClick={() => { const frame = frameRef.current; if (frame) send(frame, "close", nonce); closeMtmHarnessLauncher(); }}><span aria-hidden="true">X</span></Button>
        </header>
        {/* The first-party app keeps its OAuth callback and storage on its own CDN origin. */}
        <iframe
          ref={frameRef}
          src={MTM_HARNESS_LAUNCHER_APP_URL}
          title="MTM cloud workspace"
          loading="lazy"
          referrerPolicy="no-referrer"
          sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          allow="clipboard-read; clipboard-write"
          className="min-h-0 w-full flex-1 border-0"
          onLoad={(event) => { send(event.currentTarget, "hello", nonce); }}
          onError={() => { publish({ ...snapshot(), error: "MTM cloud workspace is unavailable" }); }}
        />
        {current.error ? <p className="border-border border-t px-3 py-2 text-destructive text-xs" role="alert">{current.error}</p> : null}
      </dialog>
    </div>
  );
}
