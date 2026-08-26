export const LAUNCHER_CONTRACT_VERSION = 1 as const;
export const DEFAULT_ALLOWED_PARENT_ORIGINS = [
  "https://gomtm-dev.yuepa8.com",
  "http://127.0.0.1:3080",
  "http://localhost:3080",
] as const;

export type LauncherMessageType = "hello" | "ready" | "open" | "close" | "theme" | "locale" | "resize";

type JsonRecord = Record<string, unknown>;

export interface MtmHarnessHostBridge {
  send(type: Exclude<LauncherMessageType, "hello" | "ready">, payload?: Record<string, unknown>): void;
  dispose(): void;
}

export interface HostBridgeOptions {
  allowedParentOrigins?: readonly string[];
  onOpen?: () => void;
  onClose?: () => void;
  window?: Window;
  parentWindow?: Window;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validNonce(value: unknown): value is string {
  return typeof value === "string" && value.length >= 16 && value.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(value);
}

function validOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.hostname === "localhost" || url.hostname === "127.0.0.1") && url.origin === value;
  } catch {
    return false;
  }
}

export function installHostBridge(options: HostBridgeOptions = {}): MtmHarnessHostBridge {
  const currentWindow = options.window ?? (typeof window === "undefined" ? undefined : window);
  if (currentWindow === undefined) return { send() {}, dispose() {} };
  const parentWindow = options.parentWindow ?? currentWindow.parent;
  if (parentWindow === currentWindow) return { send() {}, dispose() {} };
  const allowedOrigins = new Set((options.allowedParentOrigins ?? DEFAULT_ALLOWED_PARENT_ORIGINS).filter(validOrigin));
  let parentOrigin: string | undefined;
  let nonce: string | undefined;

  const post = (type: LauncherMessageType, payload: Record<string, unknown> = {}): void => {
    if (parentOrigin === undefined || nonce === undefined) return;
    parentWindow.postMessage({ type, contractVersion: LAUNCHER_CONTRACT_VERSION, nonce, ...payload }, parentOrigin);
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== parentWindow || !allowedOrigins.has(event.origin) || !isRecord(event.data)) return;
    const message = event.data;
    if (message.contractVersion !== LAUNCHER_CONTRACT_VERSION || typeof message.type !== "string") return;
    if (message.type === "hello") {
      if (!validNonce(message.nonce)) return;
      parentOrigin = event.origin;
      nonce = message.nonce;
      parentWindow.postMessage({ type: "ready", contractVersion: LAUNCHER_CONTRACT_VERSION, nonce }, parentOrigin);
      return;
    }
    if (parentOrigin !== event.origin || !validNonce(message.nonce) || message.nonce !== nonce) return;
    if (message.type === "open") options.onOpen?.();
    if (message.type === "close") options.onClose?.();
    if (message.type === "theme" && (message.value === "dark" || message.value === "light")) {
      document.documentElement.classList.toggle("dark", message.value === "dark");
    }
    if (message.type === "locale" && typeof message.value === "string" && /^[a-zA-Z0-9_-]{2,16}$/u.test(message.value)) {
      document.documentElement.lang = message.value;
    }
  };

  currentWindow.addEventListener("message", onMessage);
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(() => {
    const height = Math.max(320, Math.min(900, document.documentElement.scrollHeight));
    post("resize", { height });
  });
  observer?.observe(document.documentElement);

  return {
    send(type, payload = {}) { post(type, payload); },
    dispose() {
      currentWindow.removeEventListener("message", onMessage);
      observer?.disconnect();
      parentOrigin = undefined;
      nonce = undefined;
    },
  };
}
