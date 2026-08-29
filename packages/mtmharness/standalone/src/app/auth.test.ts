import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthClient, OAuthError, createPkceChallenge, oauthTransactionStorageKey, type OAuthClientConfig } from "./auth";
import { normalizeConfig } from "./config";

const issuer = "https://auth.example.test";
const config: OAuthClientConfig = {
  issuer,
  clientId: "mtm-public-client",
  redirectUri: "http://localhost/callback",
  resource: issuer + "/api/dsh",
  scopes: ["openid", "dsh:connect"],
};
const metadata = {
  issuer,
  authorization_endpoint: issuer + "/api/auth/oauth2/authorize",
  token_endpoint: issuer + "/api/auth/oauth2/token",
  jwks_uri: issuer + "/api/auth/jwks",
  revocation_endpoint: issuer + "/api/auth/oauth2/revoke",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  scopes_supported: config.scopes,
  id_token_signing_alg_values_supported: ["EdDSA"],
};

let now = 1_700_000_000_000;
let idTokenKeys: CryptoKeyPair | undefined;
let idTokenJwk: JsonWebKey | undefined;

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function jsonPart(value: Record<string, unknown>): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

async function signedIdToken(nonce: string, subject = "user-1"): Promise<string> {
  if (idTokenKeys === undefined) {
    idTokenKeys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    idTokenJwk = await crypto.subtle.exportKey("jwk", idTokenKeys.publicKey);
  }
  const header = jsonPart({ alg: "EdDSA", kid: "test-key", typ: "JWT" });
  const payload = jsonPart({ iss: issuer, aud: config.clientId, exp: Math.floor(now / 1000) + 300, nonce, sub: subject });
  const signingInput = new TextEncoder().encode(header + "." + payload);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, idTokenKeys.privateKey, arrayBuffer(signingInput)));
  return header + "." + payload + "." + base64Url(signature);
}

async function jwksResponse(): Promise<Response> {
  if (idTokenJwk === undefined) await signedIdToken("jwks-initializer");
  if (idTokenJwk === undefined) throw new Error("test signing key missing");
  return Response.json({ keys: [{ ...idTokenJwk, kid: "test-key", alg: "EdDSA", use: "sig" }] });
}

function discoveryResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({ ...metadata, ...overrides });
}

function tokenResponse(accessToken = "access-1", refreshToken = "refresh-1", expiresIn = 300, idToken?: string): Response {
  return Response.json({ access_token: accessToken, refresh_token: refreshToken, token_type: "Bearer", expires_in: expiresIn, scope: config.scopes.join(" "), resource: config.resource, ...(idToken === undefined ? {} : { id_token: idToken }) });
}

async function authorizationTokenResponse(nonce: string, accessToken = "access-1", refreshToken = "refresh-1", expiresIn = 300, signedNonce = nonce): Promise<Response> {
  return tokenResponse(accessToken, refreshToken, expiresIn, await signedIdToken(signedNonce));
}

function createAuth(fetcher: typeof fetch): OAuthClient {
  return new OAuthClient(config, { fetch: fetcher, storage: sessionStorage, location: window.location, history: window.history, now: () => now });
}

function transaction(): { state: string; verifier: string; nonce: string } {
  const raw = sessionStorage.getItem(oauthTransactionStorageKey(config));
  if (raw === null) throw new Error("transaction missing");
  return JSON.parse(raw) as { state: string; verifier: string; nonce: string };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

afterEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("OAuthClient", () => {
  it("generates S256 PKCE and stores only a partitioned transaction", async () => {
    const verifier = "a".repeat(64);
    const challenge = await createPkceChallenge(verifier);
    expect(challenge).toBe("_-BU_nrgy23GXDr5th1SCfQ5hR20PQulmXM33xVGaOs");
    const fetcher = vi.fn(async () => discoveryResponse());
    const auth = createAuth(fetcher);
    const url = new URL(await auth.beginLogin());
    const stored = transaction();
    expect(url.origin).toBe(issuer);
    expect(url.pathname).toBe("/api/auth/oauth2/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe(stored.state);
    expect(url.searchParams.get("nonce")).toBe(stored.nonce);
    expect(url.searchParams.get("resource")).toBe(config.resource);
    expect(JSON.stringify(stored)).not.toContain("access-");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
    auth.dispose({ preserveAuthorization: true });
    expect(sessionStorage.getItem(oauthTransactionStorageKey(config))).not.toBeNull();
    const cleanupAuth = createAuth(fetcher);
    await cleanupAuth.beginLogin();
    cleanupAuth.dispose();
    expect(sessionStorage.getItem(oauthTransactionStorageKey(config))).toBeNull();
  });

  it("accepts a path issuer with independent endpoints and caller scopes", async () => {
    const pathIssuer = "https://issuer.example.test/tenants/alpha";
    const pathConfig: OAuthClientConfig = {
      issuer: pathIssuer,
      clientId: "mtm-path-client",
      redirectUri: "http://localhost/callback",
      discoveryUrl: "https://discovery.example.test/oidc",
      resource: "https://dsh.example.test/api/dsh",
      scopes: ["openid", "connect:read"],
    };
    const pathMetadata = {
      ...metadata,
      issuer: pathIssuer,
      authorization_endpoint: "https://authorize.example.test/authorize",
      token_endpoint: "https://tokens.example.test/token",
      jwks_uri: "https://keys.example.test/jwks",
      grant_types_supported: ["authorization_code"],
      scopes_supported: pathConfig.scopes,
    };
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === pathConfig.discoveryUrl) return Response.json(pathMetadata);
      if (url === pathMetadata.token_endpoint) {
        return Response.json({
          access_token: "path-access",
          token_type: "Bearer",
          expires_in: 300,
          scope: "openid",
          resource: pathConfig.resource,
          id_token: "not-used",
        });
      }
      throw new Error("unexpected request");
    });
    const auth = new OAuthClient(pathConfig, {
      fetch: fetcher,
      storage: sessionStorage,
      location: window.location,
      history: window.history,
      now: () => now,
    });

    expect(normalizeConfig({ apiOrigin: pathConfig.resource, oauth: pathConfig }).oauth).toMatchObject({
      issuer: pathIssuer,
      discoveryUrl: pathConfig.discoveryUrl,
      resource: pathConfig.resource,
      scopes: pathConfig.scopes,
    });
    const authorization = new URL(await auth.beginLogin());
    expect(authorization.origin).toBe("https://authorize.example.test");
    expect(authorization.searchParams.get("resource")).toBe(pathConfig.resource);
    expect(authorization.searchParams.get("scope")).toBe("openid connect:read");

    const stored = JSON.parse(sessionStorage.getItem(oauthTransactionStorageKey(pathConfig)) ?? "{}") as { state?: string };
    await expect(
      auth.consumeCallback("http://localhost/callback?code=code&state=" + encodeURIComponent(stored.state ?? "")),
    ).rejects.toMatchObject({ code: "oauth_scope_missing" });

    const wrongIssuer = new OAuthClient(pathConfig, {
      fetch: async () => Response.json({ ...pathMetadata, issuer: pathIssuer + "/other" }),
    });
    await expect(wrongIssuer.discover()).rejects.toMatchObject({ code: "oauth_issuer_mismatch" });
    auth.dispose();
    wrongIssuer.dispose();
  });

  it("consumes a callback once and sanitizes the URL", async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("openid-configuration")) return discoveryResponse();
      if (url.endsWith("/oauth2/token")) {
        const body = init?.body as URLSearchParams;
        expect(init?.credentials).toBe("omit");
        expect(body.get("redirect_uri")).toBe(config.redirectUri);
        expect(body.get("resource")).toBe(config.resource);
        expect(body.get("code_verifier")).toBe(verifier);
        return authorizationTokenResponse(nonce);
      }
      if (url.endsWith("/api/auth/jwks")) return jwksResponse();
      if (url.endsWith("/oauth2/userinfo")) {
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer access-1");
        expect(init?.credentials).toBe("omit");
        return Response.json({ sub: "user-1" });
      }
      throw new Error("unexpected request");
    });
    const auth = createAuth(fetcher);
    await auth.beginLogin();
    const { state, verifier, nonce } = transaction();
    await expect(auth.consumeCallback("http://localhost/callback?code=one-time-code&state=" + encodeURIComponent(state))).resolves.toBe(true);
    await expect(auth.getAccessToken()).resolves.toBe("access-1");
    expect(auth.getSnapshot()).toMatchObject({ status: "authenticated", accountPartition: expect.stringMatching(/^[0-9a-f]{64}$/u) });
    expect(sessionStorage.getItem(oauthTransactionStorageKey(config))).toBeNull();
    expect(window.location.pathname).toBe("/callback");
    auth.dispose();
  });

  it("rejects mismatched state and untrusted discovery endpoints", async () => {
    const auth = createAuth(vi.fn(async () => discoveryResponse()));
    await auth.beginLogin();
    await expect(auth.consumeCallback("http://localhost/callback?code=code&state=wrong-state")).rejects.toMatchObject({ code: "oauth_state_mismatch" });
    expect(sessionStorage.getItem(oauthTransactionStorageKey(config))).toBeNull();
    const evil = createAuth(vi.fn(async () => discoveryResponse({ token_endpoint: "http://evil.example.test/token" })));
    await expect(evil.discover()).rejects.toMatchObject({ code: "oauth_endpoint_untrusted" });
    auth.dispose();
    evil.dispose();
  });

  it("rejects an ID token with a mismatched nonce", async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("openid-configuration")) return discoveryResponse();
      if (url.endsWith("/oauth2/token")) return authorizationTokenResponse(nonce, "access-1", "refresh-1", 300, "wrong-nonce");
      if (url.endsWith("/api/auth/jwks")) return jwksResponse();
      throw new Error("unexpected request");
    });
    const auth = createAuth(fetcher);
    await auth.beginLogin();
    const { state, nonce } = transaction();
    await expect(auth.consumeCallback("http://localhost/callback?code=code&state=" + encodeURIComponent(state))).rejects.toMatchObject({ code: "oauth_id_token_nonce_mismatch" });
    expect(auth.getSnapshot().status).toBe("error");
    auth.dispose();
  });

  it("does not let an old refresh overwrite a newly authenticated account", async () => {
    const refreshResponse = deferred<Response>();
    let refreshStartedResolve!: () => void;
    const refreshStarted = new Promise<void>((resolve) => { refreshStartedResolve = resolve; });
    let currentNonce = "";
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("openid-configuration")) return discoveryResponse();
      if (url.endsWith("/oauth2/token")) {
        const body = init?.body as URLSearchParams;
        if (body.get("grant_type") === "refresh_token") {
          refreshStartedResolve();
          return refreshResponse.promise;
        }
        return authorizationTokenResponse(currentNonce, body.get("code") === "second-code" ? "access-2" : "access-1");
      }
      if (url.endsWith("/api/auth/jwks")) return jwksResponse();
      throw new Error("unexpected request");
    });
    const auth = createAuth(fetcher);
    await auth.beginLogin();
    const firstTransaction = transaction();
    currentNonce = firstTransaction.nonce;
    await auth.consumeCallback("http://localhost/callback?code=first-code&state=" + encodeURIComponent(firstTransaction.state));
    now += 280_000;
    const oldRefresh = auth.getAccessToken();
    await refreshStarted;
    const secondLogin = await auth.beginLogin();
    expect(secondLogin).toContain("/api/auth/oauth2/authorize");
    const secondTransaction = transaction();
    currentNonce = secondTransaction.nonce;
    await auth.consumeCallback("http://localhost/callback?code=second-code&state=" + encodeURIComponent(secondTransaction.state));
    refreshResponse.resolve(tokenResponse("access-old", "refresh-old"));
    await expect(oldRefresh).rejects.toMatchObject({ code: "auth_required" });
    await expect(auth.getAccessToken()).resolves.toBe("access-2");
    auth.dispose();
  });

  it("refreshes once for concurrent callers and clears on invalid_grant", async () => {
    let refreshCalls = 0;
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("openid-configuration")) return discoveryResponse();
      if (url.endsWith("/oauth2/token")) {
        const body = init?.body as URLSearchParams | undefined;
        if (body?.get("grant_type") === "refresh_token") {
          refreshCalls += 1;
          return refreshCalls === 1 ? tokenResponse("access-2", "refresh-2", 300, "refresh-id-token-not-used") : new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        }
        return authorizationTokenResponse(nonce);
      }
      if (url.endsWith("/api/auth/jwks")) return jwksResponse();
      if (url.endsWith("/oauth2/userinfo")) return Response.json({ sub: "user-1" });
      throw new Error("unexpected request");
    });
    const auth = createAuth(fetcher);
    await auth.beginLogin();
    const { state, nonce } = transaction();
    await auth.consumeCallback("http://localhost/callback?code=code&state=" + encodeURIComponent(state));
    now += 280_000;
    await expect(Promise.all([auth.getAccessToken(), auth.getAccessToken()])).resolves.toEqual(["access-2", "access-2"]);
    expect(refreshCalls).toBe(1);
    now += 280_000;
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: "invalid_grant" });
    expect(auth.getSnapshot().status).toBe("signed-out");
    auth.dispose();
  });

  it("revokes both tokens on logout", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("openid-configuration")) return discoveryResponse();
      if (url.endsWith("/oauth2/token")) return authorizationTokenResponse(nonce);
      if (url.endsWith("/api/auth/jwks")) return jwksResponse();
      if (url.endsWith("/oauth2/userinfo")) return Response.json({ sub: "user-1" });
      return Response.json({});
    });
    const auth = createAuth(fetcher);
    await auth.beginLogin();
    const { state, nonce } = transaction();
    await auth.consumeCallback("http://localhost/callback?code=code&state=" + encodeURIComponent(state));
    await auth.logout();
    expect(auth.getSnapshot().status).toBe("signed-out");
    expect(calls.filter((url) => url.endsWith("/oauth2/revoke"))).toHaveLength(2);
    await expect(auth.getAccessToken()).rejects.toMatchObject({ code: "auth_required" });
    auth.dispose();
  });
});
