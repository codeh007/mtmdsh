export type MtmHarnessClientMode = "floating" | "dialog" | "fullscreen";
export type ClientPresentation = "standalone" | "embed";

export type MtmHarnessWebSocketFactory = (url: URL, accessToken: string) => WebSocket | Promise<WebSocket>;

export interface MtmHarnessRuntimeBootstrap {
  apiOrigin?: string;
  accessToken?: string;
  webSocketFactory?: MtmHarnessWebSocketFactory;
}

declare global {
  interface Window {
    __MTM_HARNESS_CONFIG__?: MtmHarnessRuntimeBootstrap;
  }
}

export interface MtmHarnessClientConfig {
  target?: Element | string;
  apiOrigin: string;
  accessToken?: string;
  webSocketFactory?: MtmHarnessWebSocketFactory;
  mode?: MtmHarnessClientMode;
}

export interface NormalizedClientConfig {
  apiOrigin: string;
  accessToken?: string;
  webSocketFactory?: MtmHarnessWebSocketFactory;
  mode: MtmHarnessClientMode;
}

export interface MtmHarnessClientHandle {
  unmount(): void;
}

const MODES: readonly MtmHarnessClientMode[] = ["floating", "dialog", "fullscreen"];

export function normalizeUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError(field + " must be an absolute URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(field + " must use http or https");
  }
  return url.toString();
}

export function normalizeOrigin(value: string, field: string): string {
  return new URL(normalizeUrl(value, field)).origin;
}

export function normalizeConfig(config: MtmHarnessClientConfig): NormalizedClientConfig {
  const mode = config.mode ?? "floating";
  if (!MODES.includes(mode)) {
    throw new TypeError("mode must be one of: " + MODES.join(", "));
  }
  const apiOrigin = normalizeOrigin(config.apiOrigin, "apiOrigin");
  const accessToken = config.accessToken?.trim();
  if (accessToken === "") throw new TypeError("accessToken must not be empty");
  return {
    apiOrigin,
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(config.webSocketFactory === undefined ? {} : { webSocketFactory: config.webSocketFactory }),
    mode,
  };
}

export function resolveStandaloneBasepath(base: string, href: string): string | undefined {
  const pathname = new URL(base === "./" || base === "" ? "." : base, href).pathname;
  return pathname.replace(/\/+$/u, "") || undefined;
}

export function resolveTarget(target: MtmHarnessClientConfig["target"]): Element {
  if (typeof document === "undefined") {
    throw new Error("mtmharness can only mount in a browser");
  }
  if (typeof Element !== "undefined" && target instanceof Element) return target;
  if (typeof target === "string") {
    const element = document.querySelector(target);
    if (element) return element;
    throw new Error("target selector did not match an element: " + target);
  }
  return document.body ?? document.documentElement;
}
