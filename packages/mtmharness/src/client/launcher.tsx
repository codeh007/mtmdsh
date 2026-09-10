import { useEffect, useRef, useSyncExternalStore, type ReactElement } from "react";
import { Button } from "@deepseek-ai/dsh-client-ui-primitives";
import { MTM_HARNESS_LAUNCHER_APP_ORIGIN, MTM_HARNESS_LAUNCHER_APP_URL, LAUNCHER_CONTRACT_VERSION } from "../features/launcher/contract.ts";
import { closeMtmHarnessLauncher, openMtmHarnessLauncher, publish, snapshot, subscribe, type LauncherState } from "./launcher-state.ts";

export { LAUNCHER_CONTRACT_VERSION as MTM_HARNESS_LAUNCHER_CONTRACT_VERSION, MTM_HARNESS_LAUNCHER_APP_ORIGIN, MTM_HARNESS_LAUNCHER_APP_URL } from "../features/launcher/contract.ts";

const styles = {
  layer: { inset: 0, pointerEvents: "none", position: "fixed" } as const,
  button: { bottom: 16, pointerEvents: "auto", position: "absolute", right: 16 } as const,
  dialog: { bottom: 16, height: 640, left: "auto", margin: 0, maxHeight: "calc(100vh - 32px)", maxWidth: "calc(100vw - 32px)", padding: 0, pointerEvents: "auto", position: "absolute", right: 16, top: "auto", width: 832 } as const,
  header: { alignItems: "center", display: "flex", height: 48, justifyContent: "space-between", padding: "0 12px" } as const,
  frame: { border: 0, display: "block", height: "calc(100% - 48px)", width: "100%" } as const,
};

type LauncherMessageType = "ready" | "close" | "resize";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isMessage(value: unknown, type: LauncherMessageType, nonce: string): boolean {
  return isRecord(value) && value.type === type && value.contractVersion === LAUNCHER_CONTRACT_VERSION && value.nonce === nonce;
}

function send(frame: HTMLIFrameElement, type: "hello" | "open" | "close" | "theme" | "locale", nonce: string): void {
  frame.contentWindow?.postMessage({
    type,
    contractVersion: LAUNCHER_CONTRACT_VERSION,
    nonce,
    ...(type === "theme" ? { value: document.documentElement.classList.contains("dark") ? "dark" : "light" } : {}),
    ...(type === "locale" ? { value: document.documentElement.lang || navigator.language } : {}),
  }, MTM_HARNESS_LAUNCHER_APP_ORIGIN);
}

export function MtmHarnessLauncherOverlay(): ReactElement {
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
      } else if (isMessage(event.data, "close", nonce)) {
        closeMtmHarnessLauncher();
      } else if (isMessage(event.data, "resize", nonce) && typeof event.data.height === "number" && Number.isFinite(event.data.height)) {
        publish({ ...snapshot(), height: Math.max(320, Math.min(900, Math.round(event.data.height))) });
      }
    };
    window.addEventListener("message", onMessage);
    return () => { window.removeEventListener("message", onMessage); };
  }, [current.open, current.nonce]);

  if (!current.open || current.nonce === undefined) {
    return <Button type="button" variant="outline" size="md" style={styles.button} onClick={openMtmHarnessLauncher} aria-label="Open MTM cloud workspace" title="Open MTM cloud workspace">MTM Cloud</Button>;
  }

  const nonce = current.nonce;
  return (
    <div data-mtmharness-launcher="true" style={styles.layer}>
      <dialog open style={{ ...styles.dialog, height: current.height }} aria-label="MTM cloud workspace">
        <header style={styles.header}><strong>MTM Cloud</strong><Button type="button" variant="ghost" size="sm" onClick={() => { const frame = frameRef.current; if (frame) send(frame, "close", nonce); closeMtmHarnessLauncher(); }} aria-label="Close MTM cloud workspace" title="Close MTM cloud workspace">X</Button></header>
        <iframe ref={frameRef} src={MTM_HARNESS_LAUNCHER_APP_URL} title="MTM cloud workspace" loading="lazy" referrerPolicy="no-referrer" sandbox="allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts" allow="clipboard-read; clipboard-write" style={styles.frame} onLoad={(event) => { send(event.currentTarget, "hello", nonce); }} onError={() => { publish({ ...snapshot(), error: "MTM cloud workspace is unavailable" }); }} />
        {current.error ? <p role="alert">{current.error}</p> : null}
      </dialog>
    </div>
  );
}
