import { MemoryTokenSource, OAuthClient, type MtmHarnessTokenSource, type OAuthClientConfig } from "./auth";

export type MtmHarnessClientMode = "floating" | "dialog" | "fullscreen";
export type ClientPresentation = "standalone" | "embed";
export type MtmHarnessWebSocketFactory = (url: URL, protocols: readonly string[]) => WebSocket | Promise<WebSocket>;

export interface MtmHarnessRuntimeBootstrap {
  apiOrigin?: string;
  oauth?: OAuthClientConfig;
  /** Explicit in-memory host/test adapter. Never populate this from markup. */
  accessToken?: string;
  tokenSource?: MtmHarnessTokenSource;
  webSocketFactory?: MtmHarnessWebSocketFactory;
  allowedParentOrigins?: readonly string[];
}

declare global {
  interface Window {
    __MTM_HARNESS_CONFIG__?: MtmHarnessRuntimeBootstrap;
  }
}

export interface MtmHarnessClientConfig {
  target?: Element | string;
  apiOrigin: string;
  oauth?: OAuthClientConfig;
  /** Explicit in-memory host/test adapter. */
  accessToken?: string;
  tokenSource?: MtmHarnessTokenSource;
  webSocketFactory?: MtmHarnessWebSocketFactory;
  allowedParentOrigins?: readonly string[];
  mode?: MtmHarnessClientMode;
}

export interface NormalizedClientConfig {
  apiOrigin: string;
  oauth?: OAuthClientConfig;
  accessToken?: string;
  tokenSource?: MtmHarnessTokenSource;
  webSocketFactory?: MtmHarnessWebSocketFactory;
  allowedParentOrigins: readonly string[];
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

function normalizeOAuthConfig(value: OAuthClientConfig | undefined): OAuthClientConfig | undefined {
  if (value === undefined) return undefined;
  const issuer = normalizeIssuer(value.issuer);
  const redirectUri = normalizeRedirectUri(value.redirectUri);
  const resource = normalizeHttpsUrl(value.resource, "oauth.resource");
  const clientId = value.clientId.trim();
  if (!clientId || clientId.length > 256 || /[\u0000-\u001f\u007f]/u.test(clientId)) {
    throw new TypeError("oauth.clientId must be a non-empty safe string");
  }
  const discoveryUrl = value.discoveryUrl === undefined ? undefined : normalizeHttpsUrl(value.discoveryUrl, "oauth.discoveryUrl");
  const scopes = value.scopes === undefined ? undefined : [...value.scopes];
  if (scopes !== undefined && (scopes.length === 0 || scopes.some((scope) => typeof scope !== "string" || !scope.trim()))) {
    throw new TypeError("oauth.scopes must contain non-empty strings");
  }
  return {
    issuer,
    clientId,
    redirectUri,
    resource,
    ...(discoveryUrl === undefined ? {} : { discoveryUrl }),
    ...(scopes === undefined ? {} : { scopes }),
  };
}

function normalizeIssuer(value: string): string {
  const url = new URL(normalizeUrl(value, "oauth.issuer"));
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("oauth.issuer must be a canonical HTTPS origin");
  }
  return url.origin;
}

function normalizeHttpsUrl(value: string, field: string): string {
  const url = new URL(normalizeUrl(value, field));
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new TypeError(field + " must use HTTPS without credentials or fragments");
  }
  return url.toString();
}

function normalizeRedirectUri(value: string): string {
  const url = new URL(normalizeUrl(value, "oauth.redirectUri"));
  const loopback = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.hash) {
    throw new TypeError("oauth.redirectUri must use HTTPS or loopback HTTP without credentials or fragments");
  }
  return url.toString();
}

function normalizeParentOrigins(values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return [];
  return [...new Set(values.map((value) => normalizeOrigin(value, "allowedParentOrigins")))];
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
    ...(config.oauth === undefined ? {} : { oauth: normalizeOAuthConfig(config.oauth) }),
    ...(accessToken === undefined ? {} : { accessToken }),
    ...(config.tokenSource === undefined ? {} : { tokenSource: config.tokenSource }),
    ...(config.webSocketFactory === undefined ? {} : { webSocketFactory: config.webSocketFactory }),
    allowedParentOrigins: normalizeParentOrigins(config.allowedParentOrigins),
    mode,
  };
}

export function createTokenSource(config: NormalizedClientConfig): MtmHarnessTokenSource | undefined {
  if (config.tokenSource !== undefined) return config.tokenSource;
  if (config.oauth !== undefined) return new OAuthClient(config.oauth);
  return config.accessToken === undefined ? undefined : new MemoryTokenSource(config.accessToken);
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
