export const OAUTH_CONTRACT_VERSION = 2 as const;
const TRANSACTION_TTL_MS = 10 * 60_000;
const REFRESH_SKEW_MS = 30_000;
const MAX_ACCESS_TOKEN_LIFETIME_MS = 24 * 60 * 60_000;
const SUPPORTED_ID_TOKEN_ALGORITHMS = ["EdDSA", "RS256"] as const;
const SAFE_VALUE = /^[^\u0000-\u001f\u007f]+$/u;

export interface OAuthClientConfig {
  issuer: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  discoveryUrl?: string;
  scopes: readonly string[];
}

export interface OAuthDiscovery {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userinfoEndpoint?: string;
  jwksUri: string;
  idTokenSigningAlgorithms: readonly string[];
  revocationEndpoint?: string;
  endSessionEndpoint?: string;
}

export type MtmHarnessAuthStatus = "signed-out" | "discovering" | "ready" | "authorizing" | "authenticated" | "error";

export interface MtmHarnessAuthSnapshot {
  status: MtmHarnessAuthStatus;
  accountPartition?: string;
  expiresAt?: number;
  error?: string;
}

export interface MtmHarnessTokenSource {
  getAccessToken(): Promise<string>;
  getAccountPartition(): string | undefined;
  subscribe(listener: (snapshot: MtmHarnessAuthSnapshot) => void): () => void;
  clear(): void;
}

export interface MtmHarnessAuthClient extends MtmHarnessTokenSource {
  getSnapshot(): MtmHarnessAuthSnapshot;
  discover(): Promise<OAuthDiscovery>;
  beginLogin(options?: { selectAccount?: boolean }): Promise<string>;
  consumeCallback(callbackUrl?: string): Promise<boolean>;
  logout(): Promise<void>;
  switchAccount(): Promise<string>;
  dispose(options?: { preserveAuthorization?: boolean }): void;
}

export interface OAuthClientOptions {
  fetch?: typeof fetch;
  storage?: Storage;
  location?: Location;
  history?: History;
  now?: () => number;
}

export class OAuthError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) {
    super(message);
    this.name = "OAuthError";
  }
}

interface OAuthTransaction {
  issuer: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  state: string;
  verifier: string;
  nonce: string;
  createdAt: number;
}

interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt: number;
  accountPartition: string;
}

type JsonRecord = Record<string, unknown>;
type Listener = (snapshot: MtmHarnessAuthSnapshot) => void;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeString(value: unknown, label: string, maxLength = 4096): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || !SAFE_VALUE.test(value)) {
    throw new OAuthError("Invalid OAuth " + label, "oauth_response_invalid");
  }
  return value;
}

function urlValue(value: unknown, label: string, allowQuery = false): string {
  const raw = safeString(value, label);
  let url: URL;
  try { url = new URL(raw); } catch { throw new OAuthError("Invalid OAuth " + label, "oauth_metadata_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || (!allowQuery && url.search)) {
    throw new OAuthError("Untrusted OAuth " + label, "oauth_endpoint_untrusted");
  }
  return url.toString();
}

function canonicalIssuer(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new OAuthError("OAuth issuer is invalid", "oauth_issuer_invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new OAuthError("OAuth issuer must be a canonical HTTPS URL", "oauth_issuer_invalid");
  }
  return url.pathname === "/" ? url.origin : url.toString();
}

function redirectUriValue(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new OAuthError("OAuth redirect URI is invalid", "oauth_redirect_invalid"); }
  const loopback = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]");
  if ((!loopback && url.protocol !== "https:") || url.username || url.password || url.hash) {
    throw new OAuthError("OAuth redirect URI is invalid", "oauth_redirect_invalid");
  }
  return url.toString();
}

function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (typeof crypto === "undefined" || !crypto.getRandomValues) throw new OAuthError("Secure randomness is unavailable", "oauth_crypto_unavailable");
  crypto.getRandomValues(bytes);
  return bytes;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function randomText(): string {
  return base64Url(randomBytes(32));
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new OAuthError("Web Crypto is unavailable", "oauth_crypto_unavailable");
  return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

async function hashPartition(issuer: string, subject: string): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) throw new OAuthError("Web Crypto is unavailable", "oauth_crypto_unavailable");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(issuer + "|" + subject)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function storageKey(config: OAuthClientConfig): string {
  return "mtmharness:oauth:v1:transaction:" + encodeURIComponent(config.issuer + "|" + config.clientId + "|" + config.redirectUri);
}

export function oauthTransactionStorageKey(config: OAuthClientConfig): string {
  return storageKey(config);
}

function scopesFor(config: OAuthClientConfig): readonly string[] {
  const scopes = config.scopes;
  if (scopes.length === 0 || scopes.some((scope) => typeof scope !== "string" || !scope.trim())) {
    throw new OAuthError("OAuth scopes are invalid", "oauth_scope_invalid");
  }
  if (!scopes.includes("openid")) throw new OAuthError("OAuth scope is missing: openid", "oauth_scope_invalid");
  return [...new Set(scopes)];
}

function responseArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item)) throw new OAuthError("Invalid OAuth " + label, "oauth_metadata_invalid");
  return value;
}

function responseArrayOfRecords(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) throw new OAuthError("Invalid OAuth " + label, "oauth_jwks_invalid");
  return value;
}

function decodeBase64Url(value: string, label: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new OAuthError("Invalid OAuth " + label, "oauth_id_token_invalid");
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    throw new OAuthError("Invalid OAuth " + label, "oauth_id_token_invalid");
  }
}

function jsonPart(value: string, label: string): JsonRecord {
  try {
    return responseBody(JSON.parse(new TextDecoder().decode(decodeBase64Url(value, label))), label);
  } catch (error) {
    if (error instanceof OAuthError) throw error;
    throw new OAuthError("Invalid OAuth " + label, "oauth_id_token_invalid");
  }
}

function responseBody(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new OAuthError("Invalid OAuth " + label, "oauth_response_invalid");
  return value;
}

function callbackMatchesRedirect(callback: URL, expectedValue: string): boolean {
  const expected = new URL(expectedValue);
  if (callback.origin !== expected.origin || callback.pathname !== expected.pathname || callback.hash) return false;
  for (const [key, value] of expected.searchParams) if (callback.searchParams.get(key) !== value) return false;
  return true;
}

function safeOAuthError(error: unknown, fallbackCode: string): OAuthError {
  if (error instanceof OAuthError) return error;
  return new OAuthError("OAuth request failed", fallbackCode);
}

export class OAuthClient implements MtmHarnessAuthClient {
  private readonly config: OAuthClientConfig;
  private readonly fetcher: typeof fetch;
  private readonly storage: Storage | undefined;
  private readonly location: Location | undefined;
  private readonly history: History | undefined;
  private readonly now: () => number;
  private readonly listeners = new Set<Listener>();
  private snapshot: MtmHarnessAuthSnapshot = { status: "signed-out" };
  private metadata: OAuthDiscovery | undefined;
  private tokens: TokenSet | undefined;
  private refreshPromise: Promise<string> | undefined;
  private disposed = false;

  constructor(config: OAuthClientConfig, options: OAuthClientOptions = {}) {
    const issuer = canonicalIssuer(config.issuer);
    this.config = {
      issuer,
      clientId: safeString(config.clientId, "clientId", 256),
      redirectUri: redirectUriValue(config.redirectUri),
      resource: urlValue(config.resource, "resource", true),
      ...(config.discoveryUrl === undefined ? {} : { discoveryUrl: urlValue(config.discoveryUrl, "discovery URL", true) }),
      scopes: [...config.scopes],
    };
    this.fetcher = options.fetch ?? (typeof fetch === "function" ? fetch.bind(globalThis) : (() => { throw new OAuthError("Fetch is unavailable", "oauth_network_unavailable"); }) as typeof fetch);
    this.storage = options.storage ?? (typeof sessionStorage === "undefined" ? undefined : sessionStorage);
    this.location = options.location ?? (typeof location === "undefined" ? undefined : location);
    this.history = options.history ?? (typeof history === "undefined" ? undefined : history);
    this.now = options.now ?? (() => Date.now());
  }

  getSnapshot(): MtmHarnessAuthSnapshot { return this.snapshot; }

  getAccountPartition(): string | undefined { return this.tokens?.accountPartition; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async discover(): Promise<OAuthDiscovery> {
    this.ensureActive();
    if (this.metadata !== undefined) return this.metadata;
    this.publish({ status: "discovering", error: undefined });
    const endpoint = this.config.discoveryUrl ?? this.config.issuer.replace(/\/$/u, "") + "/.well-known/openid-configuration";
    let response: Response;
    try {
      response = await this.fetcher(endpoint, { method: "GET", credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json" } });
    } catch { throw this.fail(new OAuthError("OAuth discovery is unavailable", "oauth_discovery_unavailable")); }
    if (!response.ok) throw this.fail(new OAuthError("OAuth discovery failed", "oauth_discovery_failed", response.status));
    let body: unknown;
    try { body = await response.json(); } catch { throw this.fail(new OAuthError("OAuth discovery returned invalid data", "oauth_metadata_invalid")); }
    try {
      const item = responseBody(body, "discovery metadata");
      const issuer = canonicalIssuer(safeString(item.issuer, "issuer"));
      if (issuer !== this.config.issuer) throw new OAuthError("OAuth issuer mismatch", "oauth_issuer_mismatch");
      const authorizationEndpoint = urlValue(item.authorization_endpoint, "authorization endpoint");
      const tokenEndpoint = urlValue(item.token_endpoint, "token endpoint");
      const userinfoEndpoint = item.userinfo_endpoint === undefined ? undefined : urlValue(item.userinfo_endpoint, "userinfo endpoint");
      const jwksUri = urlValue(item.jwks_uri, "JWKS URI");
      const revocationEndpoint = item.revocation_endpoint === undefined ? undefined : urlValue(item.revocation_endpoint, "revocation endpoint");
      const endSessionEndpoint = item.end_session_endpoint === undefined ? undefined : urlValue(item.end_session_endpoint, "end-session endpoint");
      const responseTypes = responseArray(item.response_types_supported, "response types");
      const grantTypes = responseArray(item.grant_types_supported, "grant types");
      const challenges = responseArray(item.code_challenge_methods_supported, "PKCE methods");
      const scopes = responseArray(item.scopes_supported, "scopes");
      const idTokenSigningAlgorithms = responseArray(item.id_token_signing_alg_values_supported, "ID token signing algorithms");
      if (!idTokenSigningAlgorithms.some((algorithm) => (SUPPORTED_ID_TOKEN_ALGORITHMS as readonly string[]).includes(algorithm))) throw new OAuthError("OAuth authority does not support a verified ID token", "oauth_id_token_algorithm_missing");
      if (!responseTypes.includes("code") || !grantTypes.includes("authorization_code") || !challenges.includes("S256")) {
        throw new OAuthError("OAuth authority does not support the required flow", "oauth_capability_missing");
      }
      const advertisedScopes = new Set(scopes);
      for (const scope of scopesFor(this.config)) if (!advertisedScopes.has(scope)) throw new OAuthError("OAuth authority is missing scope: " + scope, "oauth_scope_missing");
      this.metadata = { issuer, authorizationEndpoint, tokenEndpoint, ...(userinfoEndpoint === undefined ? {} : { userinfoEndpoint }), jwksUri, idTokenSigningAlgorithms, ...(revocationEndpoint === undefined ? {} : { revocationEndpoint }), ...(endSessionEndpoint === undefined ? {} : { endSessionEndpoint }) };
      this.publish({ status: "ready", error: undefined });
      return this.metadata;
    } catch (error) {
      throw this.fail(safeOAuthError(error, "oauth_metadata_invalid"));
    }
  }

  async beginLogin(options: { selectAccount?: boolean } = {}): Promise<string> {
    this.ensureActive();
    this.clear();
    const metadata = await this.discover();
    const transaction: OAuthTransaction = {
      issuer: this.config.issuer,
      clientId: this.config.clientId,
      redirectUri: this.config.redirectUri,
      resource: this.config.resource,
      state: randomText(),
      verifier: randomText(),
      nonce: randomText(),
      createdAt: this.now(),
    };
    const challenge = await createPkceChallenge(transaction.verifier);
    try {
      if (this.storage === undefined) throw new OAuthError("Session storage is unavailable", "oauth_storage_unavailable");
      this.storage.setItem(storageKey(this.config), JSON.stringify(transaction));
    } catch (error) {
      throw this.fail(error instanceof OAuthError ? error : new OAuthError("Session storage is unavailable", "oauth_storage_unavailable"));
    }
    const url = new URL(metadata.authorizationEndpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("scope", scopesFor(this.config).join(" "));
    url.searchParams.set("resource", this.config.resource);
    url.searchParams.set("state", transaction.state);
    url.searchParams.set("nonce", transaction.nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    if (options.selectAccount) url.searchParams.set("prompt", "select_account");
    this.publish({ status: "authorizing", error: undefined });
    return url.toString();
  }

  async consumeCallback(callbackUrl?: string): Promise<boolean> {
    this.ensureActive();
    const raw = callbackUrl ?? this.location?.href;
    if (raw === undefined) return false;
    let callback: URL;
    try { callback = new URL(raw); } catch { return false; }
    const params = callback.searchParams;
    if (!params.has("code") && !params.has("state") && !params.has("error")) return false;
    try {
      const transaction = this.readTransaction();
      this.removeTransaction();
      if (!callbackMatchesRedirect(callback, transaction.redirectUri) || transaction.redirectUri !== this.config.redirectUri || transaction.issuer !== this.config.issuer || transaction.clientId !== this.config.clientId || transaction.resource !== this.config.resource) {
        throw new OAuthError("OAuth redirect URI mismatch", "oauth_redirect_mismatch");
      }
      const state = params.get("state");
      if (state === null || state !== transaction.state) throw new OAuthError("OAuth state mismatch", "oauth_state_mismatch");
      const issuer = params.get("iss");
      if (issuer !== null && issuer !== this.config.issuer) throw new OAuthError("OAuth issuer mismatch", "oauth_issuer_mismatch");
      const providerError = params.get("error");
      if (providerError !== null) throw new OAuthError("OAuth authorization was denied", "oauth_authorization_denied");
      const code = params.get("code");
      if (code === null || code.length === 0 || code.length > 4096 || !SAFE_VALUE.test(code)) throw new OAuthError("OAuth authorization code is invalid", "oauth_code_invalid");
      const tokenSet = await this.exchangeCode(code, transaction.verifier);
      const subject = await this.verifyIdToken(tokenSet.idToken, transaction.nonce);
      const accountPartition = await hashPartition(this.config.issuer, subject);
      this.tokens = { ...tokenSet, accountPartition };
      this.sanitizeCallbackUrl();
      this.publish({ status: "authenticated", accountPartition, expiresAt: tokenSet.expiresAt, error: undefined });
      return true;
    } catch (error) {
      this.removeTransaction();
      this.tokens = undefined;
      this.sanitizeCallbackUrl();
      const normalized = safeOAuthError(error, "oauth_callback_failed");
      this.publish({ status: "error", error: normalized.message });
      throw normalized;
    }
  }

  async getAccessToken(): Promise<string> {
    this.ensureActive();
    const tokens = this.tokens;
    if (tokens === undefined) throw new OAuthError("Authentication is required", "auth_required", 401);
    if (tokens.expiresAt > this.now() + REFRESH_SKEW_MS) return tokens.accessToken;
    if (this.refreshPromise !== undefined) return this.refreshPromise;
    if (tokens.refreshToken === undefined) {
      this.clear();
      throw new OAuthError("Authentication has expired", "auth_required", 401);
    }
    this.refreshPromise = this.refresh(tokens).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  clear(): void {
    this.tokens = undefined;
    this.removeTransaction();
    if (!this.disposed) {
      this.snapshot = { status: "signed-out" };
      for (const listener of this.listeners) listener(this.snapshot);
    }
  }

  async logout(): Promise<void> {
    const tokens = this.tokens;
    const metadata = this.metadata;
    this.clear();
    if (tokens === undefined || metadata?.revocationEndpoint === undefined) return;
    await Promise.allSettled([
      this.revoke(metadata.revocationEndpoint, tokens.accessToken, "access_token"),
      ...(tokens.refreshToken === undefined ? [] : [this.revoke(metadata.revocationEndpoint, tokens.refreshToken, "refresh_token")]),
    ]);
  }

  async switchAccount(): Promise<string> {
    await this.logout();
    return this.beginLogin({ selectAccount: true });
  }

  dispose(options: { preserveAuthorization?: boolean } = {}): void {
    if (this.disposed) return;
    this.disposed = true;
    this.tokens = undefined;
    if (options.preserveAuthorization !== true) this.removeTransaction();
    this.listeners.clear();
  }

  private async exchangeCode(code: string, verifier: string): Promise<Omit<TokenSet, "accountPartition">> {
    const metadata = await this.discover();
    const body = new URLSearchParams({ client_id: this.config.clientId, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: this.config.redirectUri, resource: this.config.resource });
    return this.exchange(metadata.tokenEndpoint, body, "oauth_token_exchange_failed", true);
  }

  private async refresh(tokens: TokenSet): Promise<string> {
    try {
      const metadata = await this.discover();
      const refreshToken = tokens.refreshToken;
      if (refreshToken === undefined) throw new OAuthError("Authentication has expired", "auth_required", 401);
      const body = new URLSearchParams({ client_id: this.config.clientId, grant_type: "refresh_token", refresh_token: refreshToken, resource: this.config.resource });
      const next = await this.exchange(metadata.tokenEndpoint, body, "oauth_refresh_failed");
      if (this.tokens !== tokens) throw new OAuthError("Authentication has changed", "auth_required", 401);
      const accountPartition = tokens.accountPartition;
      this.tokens = { accessToken: next.accessToken, refreshToken: next.refreshToken ?? refreshToken, expiresAt: next.expiresAt, accountPartition };
      this.publish({ status: "authenticated", accountPartition, expiresAt: this.tokens.expiresAt, error: undefined });
      return next.accessToken;
    } catch (error) {
      if (this.tokens === tokens) this.clear();
      throw safeOAuthError(error, "oauth_refresh_failed");
    }
  }

  private async exchange(endpoint: string, body: URLSearchParams, fallbackCode: string, requireIdToken = false): Promise<Omit<TokenSet, "accountPartition">> {
    let response: Response;
    try {
      response = await this.fetcher(endpoint, { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body });
    } catch { throw new OAuthError("OAuth token exchange is unavailable", "oauth_network_unavailable"); }
    let value: unknown;
    try { value = await response.json(); } catch { value = undefined; }
    if (!response.ok) {
      const providerCode = isRecord(value) && typeof value.error === "string" ? value.error : fallbackCode;
      throw new OAuthError(providerCode === "invalid_grant" ? "Authentication has expired" : "OAuth token exchange failed", providerCode, response.status);
    }
    const item = responseBody(value, "token response");
    const accessToken = safeString(item.access_token, "access token");
    const tokenType = safeString(item.token_type, "token type", 32);
    const expiresIn = item.expires_in;
    if (tokenType.toLowerCase() !== "bearer" || typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0 || expiresIn * 1000 > MAX_ACCESS_TOKEN_LIFETIME_MS) {
      throw new OAuthError("OAuth token response is invalid", "oauth_response_invalid");
    }
    const scope = item.scope === undefined ? scopesFor(this.config).join(" ") : safeString(item.scope, "scope", 2048);
    const scopeSet = new Set(scope.split(/\s+/u));
    for (const requiredScope of scopesFor(this.config)) {
      if (!scopeSet.has(requiredScope)) throw new OAuthError("OAuth token scope is insufficient", "oauth_scope_missing");
    }
    if (item.resource !== undefined && item.resource !== this.config.resource) throw new OAuthError("OAuth resource mismatch", "oauth_resource_mismatch");
    const refreshToken = item.refresh_token === undefined ? undefined : safeString(item.refresh_token, "refresh token");
    const idToken = item.id_token === undefined ? undefined : safeString(item.id_token, "ID token", 16_384);
    if (requireIdToken && idToken === undefined) throw new OAuthError("OAuth token response is missing an ID token", "oauth_id_token_missing");
    return { accessToken, ...(refreshToken === undefined ? {} : { refreshToken }), ...(idToken === undefined ? {} : { idToken }), expiresAt: this.now() + expiresIn * 1000 };
  }

  private async verifyIdToken(idToken: string | undefined, expectedNonce: string): Promise<string> {
    if (idToken === undefined) throw new OAuthError("OAuth token response is missing an ID token", "oauth_id_token_missing");
    const metadata = await this.discover();
    const parts = idToken.split(".");
    if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/u.test(part))) throw new OAuthError("OAuth ID token is malformed", "oauth_id_token_invalid");
    const header = jsonPart(parts[0], "ID token header");
    const payload = jsonPart(parts[1], "ID token claims");
    const alg = safeString(header.alg, "ID token algorithm", 32);
    const kid = safeString(header.kid, "ID token key id", 256);
    if (!metadata.idTokenSigningAlgorithms.includes(alg) || !(SUPPORTED_ID_TOKEN_ALGORITHMS as readonly string[]).includes(alg)) throw new OAuthError("OAuth ID token algorithm is not trusted", "oauth_id_token_algorithm_invalid");
    if (header.typ !== undefined && header.typ !== "JWT") throw new OAuthError("OAuth ID token type is invalid", "oauth_id_token_invalid");
    const iss = safeString(payload.iss, "ID token issuer", 512);
    if (iss !== metadata.issuer) throw new OAuthError("OAuth ID token issuer mismatch", "oauth_id_token_issuer_mismatch");
    const audiences = typeof payload.aud === "string" ? [payload.aud] : responseArray(payload.aud, "ID token audience");
    if (!audiences.includes(this.config.clientId)) throw new OAuthError("OAuth ID token audience mismatch", "oauth_id_token_audience_mismatch");
    if (audiences.length > 1 && payload.azp !== this.config.clientId) throw new OAuthError("OAuth ID token authorized party mismatch", "oauth_id_token_audience_mismatch");
    if (payload.azp !== undefined && payload.azp !== this.config.clientId) throw new OAuthError("OAuth ID token authorized party mismatch", "oauth_id_token_audience_mismatch");
    const exp = payload.exp;
    if (typeof exp !== "number" || !Number.isSafeInteger(exp) || exp * 1000 <= this.now()) throw new OAuthError("OAuth ID token has expired", "oauth_id_token_expired");
    if (payload.nonce !== expectedNonce) throw new OAuthError("OAuth ID token nonce mismatch", "oauth_id_token_nonce_mismatch");
    const subject = safeString(payload.sub, "ID token subject", 512);
    const signature = decodeBase64Url(parts[2], "ID token signature");
    const signingInput = new TextEncoder().encode(parts[0] + "." + parts[1]);
    const jwks = await this.fetchJwks(metadata.jwksUri);
    const jwk = jwks.find((key) => key.kid === kid);
    if (jwk === undefined) throw new OAuthError("OAuth ID token signing key is unavailable", "oauth_id_token_key_missing");
    if (jwk.use !== undefined && jwk.use !== "sig") throw new OAuthError("OAuth ID token signing key is invalid", "oauth_id_token_key_invalid");
    if (jwk.alg !== undefined && jwk.alg !== alg) throw new OAuthError("OAuth ID token signing key algorithm mismatch", "oauth_id_token_key_invalid");
    const cryptoAlgorithm = alg === "EdDSA"
      ? { name: "Ed25519" }
      : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey("jwk", jwk as JsonWebKey, cryptoAlgorithm as AlgorithmIdentifier, false, ["verify"]);
      const valid = await crypto.subtle.verify(cryptoAlgorithm as AlgorithmIdentifier, key, signature as unknown as BufferSource, signingInput as unknown as BufferSource);
      if (!valid) throw new Error("invalid signature");
    } catch {
      throw new OAuthError("OAuth ID token signature is invalid", "oauth_id_token_signature_invalid");
    }
    return subject;
  }

  private async fetchJwks(endpoint: string): Promise<JsonRecord[]> {
    let response: Response;
    try {
      response = await this.fetcher(endpoint, { method: "GET", credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json" } });
    } catch { throw new OAuthError("OAuth signing keys are unavailable", "oauth_jwks_unavailable"); }
    if (!response.ok) throw new OAuthError("OAuth signing keys are unavailable", "oauth_jwks_unavailable", response.status);
    let value: unknown;
    try { value = await response.json(); } catch { throw new OAuthError("OAuth signing keys are invalid", "oauth_jwks_invalid"); }
    const keys = responseArrayOfRecords(responseBody(value, "JWKS" ).keys, "JWKS keys");
    return keys;
  }

  private async revoke(endpoint: string, token: string, hint: string): Promise<void> {
    await this.fetcher(endpoint, { method: "POST", credentials: "omit", cache: "no-store", redirect: "error", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: this.config.clientId, token, token_type_hint: hint }) }).catch(() => undefined);
  }

  private readTransaction(): OAuthTransaction {
    if (this.storage === undefined) throw new OAuthError("OAuth login state is unavailable", "oauth_storage_unavailable");
    let value: string | null;
    try { value = this.storage.getItem(storageKey(this.config)); } catch { throw new OAuthError("OAuth login state is unavailable", "oauth_storage_unavailable"); }
    if (value === null) throw new OAuthError("OAuth login state is missing", "oauth_state_missing");
    let item: unknown;
    try { item = JSON.parse(value); } catch { throw new OAuthError("OAuth login state is invalid", "oauth_state_invalid"); }
    const record = responseBody(item, "login state");
    const transaction: OAuthTransaction = {
      issuer: safeString(record.issuer, "login state issuer", 512),
      clientId: safeString(record.clientId, "login state client", 256),
      redirectUri: safeString(record.redirectUri, "login state redirect", 2048),
      resource: safeString(record.resource, "login state resource", 2048),
      state: safeString(record.state, "login state state", 512),
      verifier: safeString(record.verifier, "login state verifier", 512),
      nonce: safeString(record.nonce, "login state nonce", 512),
      createdAt: typeof record.createdAt === "number" ? record.createdAt : NaN,
    };
    const age = this.now() - transaction.createdAt;
    if (!Number.isFinite(transaction.createdAt) || age < 0 || age > TRANSACTION_TTL_MS) throw new OAuthError("OAuth login state has expired", "oauth_state_expired");
    return transaction;
  }

  private removeTransaction(): void {
    try { this.storage?.removeItem(storageKey(this.config)); } catch { /* optional session storage */ }
  }

  private sanitizeCallbackUrl(): void {
    if (this.history === undefined) return;
    try {
      const redirect = new URL(this.config.redirectUri);
      this.history.replaceState(null, "", redirect.pathname + redirect.search);
    } catch { /* callback cleanup is best effort */ }
  }

  private publish(patch: MtmHarnessAuthSnapshot): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private fail(error: OAuthError): OAuthError {
    if (!this.disposed) this.publish({ status: "error", error: error.message });
    return error;
  }

  private ensureActive(): void {
    if (this.disposed) throw new OAuthError("OAuth client has been disposed", "oauth_disposed");
  }
}

export class MemoryTokenSource implements MtmHarnessTokenSource {
  private token: string | undefined;
  private readonly partition: string;
  private readonly listeners = new Set<Listener>();

  constructor(accessToken: string, accountPartition = "explicit") {
    this.token = safeString(accessToken, "access token");
    this.partition = safeString(accountPartition, "account partition", 256);
  }

  getAccessToken(): Promise<string> {
    return this.token === undefined ? Promise.reject(new OAuthError("Authentication is required", "auth_required", 401)) : Promise.resolve(this.token);
  }

  getAccountPartition(): string | undefined { return this.token === undefined ? undefined : this.partition; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  clear(): void {
    this.token = undefined;
    const snapshot: MtmHarnessAuthSnapshot = { status: "signed-out" };
    for (const listener of this.listeners) listener(snapshot);
  }
}

export function createMemoryTokenSource(accessToken: string, accountPartition?: string): MemoryTokenSource {
  return new MemoryTokenSource(accessToken, accountPartition);
}
