export interface AdminOAuthConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  discoveryUrl?: string;
  scopes: readonly string[];
}

export type AdminAuthStatus = "signed-out" | "discovering" | "ready" | "authorizing" | "authenticated" | "error";

export interface AdminAuthSnapshot {
  status: AdminAuthStatus;
  error?: string;
}

export interface AdminAuthClient {
  getAccessToken(): Promise<string>;
  getSnapshot(): AdminAuthSnapshot;
  subscribe(listener: () => void): () => void;
  clear(): void;
  beginLogin(options?: { selectAccount?: boolean }): Promise<string>;
  consumeCallback(callbackUrl?: string): Promise<boolean>;
  logout(): Promise<void>;
  dispose(options?: { preserveAuthorization?: boolean }): void;
}

export interface AdminAppOptions {
  apiOrigin: string;
  oauth: AdminOAuthConfig;
  /** Explicit programmatic auth adapter for tests or a trusted host. */
  auth?: AdminAuthClient;
}

export type AdminBootstrapConfig = Omit<AdminAppOptions, "auth">;

declare global {
  interface Window {
    __MTM_ADMIN_CONFIG__?: AdminBootstrapConfig;
  }
}

export function validateAdminOAuthConfig(config: AdminOAuthConfig): void {
  let issuer: URL;
  try {
    issuer = new URL(config.issuer);
  } catch {
    throw new TypeError("Admin OAuth issuer must be an absolute HTTPS origin");
  }
  if (issuer.protocol !== "https:" || issuer.username || issuer.password || issuer.pathname !== "/" || issuer.search || issuer.hash) {
    throw new TypeError("Admin OAuth issuer must be an absolute HTTPS origin");
  }
  if (config.resource !== issuer.origin + "/api/system") throw new TypeError("Admin OAuth resource must be the gomtm control plane");
  if (!config.scopes.includes("openid") || !config.scopes.includes("gomtm:admin")) {
    throw new TypeError("Admin OAuth scopes must include openid and gomtm:admin");
  }
}

export function normalizeAdminOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new TypeError("apiOrigin must be an absolute URL");
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("apiOrigin must be an origin URL");
  }
  return url.origin;
}
