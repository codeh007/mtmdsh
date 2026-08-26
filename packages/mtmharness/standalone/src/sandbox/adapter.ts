export const SANDBOX_CONTRACT_VERSION = 1 as const;

export const SANDBOX_STATUSES = ["provisioning", "ready", "sleeping", "rehydrating", "failed", "destroyed"] as const;

export type SandboxStatus = (typeof SANDBOX_STATUSES)[number];

export interface SandboxPrincipal {
  issuer: string;
  subject: string;
}

export interface SandboxRecord {
  contractVersion: typeof SANDBOX_CONTRACT_VERSION;
  id: string;
  workspaceId: string;
  owner: SandboxPrincipal;
  name: string;
  status: SandboxStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SandboxCatalog {
  sandboxes: SandboxRecord[];
  defaultSandbox: SandboxRecord | null;
}

export interface SandboxScope {
  sandboxId: string;
  workspaceId: string;
}

export class SandboxApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SandboxApiError";
  }
}

export interface SandboxClient {
  listSandboxes(signal?: AbortSignal): Promise<SandboxCatalog>;
  getDefaultSandbox(signal?: AbortSignal): Promise<SandboxRecord | undefined>;
  createSandbox(
    name: string,
    signal?: AbortSignal,
  ): Promise<{ sandbox: SandboxRecord; defaultSandbox: SandboxRecord | null }>;
  selectSandbox(sandboxId: string, signal?: AbortSignal): Promise<SandboxRecord>;
}

export interface SandboxApiClientOptions {
  tokenProvider?: () => string | undefined | Promise<string | undefined>;
  onAuthFailure?: () => void;
}

export class SandboxApiClient implements SandboxClient {
  private readonly apiOrigin: string;
  private readonly tokenProvider: () => string | undefined | Promise<string | undefined>;
  private readonly onAuthFailure: (() => void) | undefined;

  constructor(apiOrigin: string, options: SandboxApiClientOptions | string = {}) {
    this.apiOrigin = new URL(apiOrigin).origin;
    if (typeof options === "string") {
      this.tokenProvider = () => options;
      this.onAuthFailure = undefined;
    } else {
      this.tokenProvider = options.tokenProvider ?? (() => undefined);
      this.onAuthFailure = options.onAuthFailure;
    }
  }

  listSandboxes(signal?: AbortSignal): Promise<SandboxCatalog> {
    return this.request("/api/sandboxes", undefined, parseCatalog, signal);
  }

  async getDefaultSandbox(signal?: AbortSignal): Promise<SandboxRecord | undefined> {
    const response = await this.request("/api/sandboxes/default", undefined, parseDefault, signal);
    return response;
  }

  createSandbox(
    name: string,
    signal?: AbortSignal,
  ): Promise<{ sandbox: SandboxRecord; defaultSandbox: SandboxRecord | null }> {
    return this.request("/api/sandboxes", { method: "POST", body: { name } }, parseCreate, signal);
  }

  selectSandbox(sandboxId: string, signal?: AbortSignal): Promise<SandboxRecord> {
    return this.request("/api/sandboxes/default", { method: "PUT", body: { sandboxId } }, parseSandboxResponse, signal);
  }

  private async request<T>(
    path: string,
    init: { method?: string; body?: unknown } | undefined,
    parser: (value: unknown) => T,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = await this.readAccessToken();
    const headers: Record<string, string> = { authorization: "Bearer " + token };
    let body: string | undefined;
    if (init?.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(init.body);
    }
    let response: Response;
    try {
      response = await fetch(this.apiOrigin + path, {
        method: init?.method ?? "GET",
        credentials: "omit",
        headers,
        body,
        signal,
      });
    } catch (error) {
      throw new SandboxApiError("Unable to reach the sandbox service", "sandbox_unavailable", undefined, error);
    }
    const value = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = isRecord(value) && isRecord(value.error) ? value.error : {};
      if (response.status === 401) this.onAuthFailure?.();
      throw new SandboxApiError(
        typeof error.message === "string" ? error.message : "The sandbox request failed",
        typeof error.code === "string" ? error.code : response.status === 401 ? "auth_required" : "sandbox_request_failed",
        response.status,
        error.details,
      );
    }
    try {
      return parser(value);
    } catch (error) {
      if (error instanceof SandboxApiError) throw error;
      throw new SandboxApiError(
        "The server returned an invalid sandbox response",
        "sandbox_invalid_response",
        response.status,
        error,
      );
    }
  }

  private async readAccessToken(): Promise<string> {
    let token: string | undefined;
    try { token = await this.tokenProvider(); } catch { throw new SandboxApiError("Authentication is required", "auth_required", 401); }
    if (token === undefined || token.length === 0 || token.length > 16_384 || /[\u0000-\u001f\u007f]/u.test(token)) {
      throw new SandboxApiError("Authentication is required", "auth_required", 401);
    }
    return token;
  }
}

type JsonRecord = Record<string, unknown>;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new Error("invalid " + label);
  return value;
}

function requiredString(value: JsonRecord, key: string, label: string): string {
  if (typeof value[key] !== "string" || value[key].length === 0 || hasControlCharacter(value[key]))
    throw new Error("invalid " + label);
  return value[key];
}

function requiredTimestamp(value: JsonRecord, key: string, label: string): string {
  const timestamp = requiredString(value, key, label);
  if (!ISO_TIMESTAMP_PATTERN.test(timestamp) || Number.isNaN(Date.parse(timestamp)))
    throw new Error("invalid " + label);
  return timestamp;
}

function parseSandboxRecord(value: unknown): SandboxRecord {
  const item = record(value, "sandbox record");
  if (item.contractVersion !== SANDBOX_CONTRACT_VERSION) throw new Error("invalid sandbox contract version");
  const id = requiredString(item, "id", "sandbox.id");
  const workspaceId = requiredString(item, "workspaceId", "sandbox.workspaceId");
  if (!/^sbx_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id))
    throw new Error("invalid sandbox.id");
  if (!/^ws_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(workspaceId))
    throw new Error("invalid sandbox.workspaceId");
  const owner = record(item.owner, "sandbox.owner");
  const status = requiredString(item, "status", "sandbox.status");
  if (!(SANDBOX_STATUSES as readonly string[]).includes(status)) throw new Error("invalid sandbox.status");
  return {
    contractVersion: SANDBOX_CONTRACT_VERSION,
    id,
    workspaceId,
    owner: {
      issuer: requiredString(owner, "issuer", "sandbox.owner.issuer"),
      subject: requiredString(owner, "subject", "sandbox.owner.subject"),
    },
    name: requiredString(item, "name", "sandbox.name"),
    status: status as SandboxStatus,
    createdAt: requiredTimestamp(item, "createdAt", "sandbox.createdAt"),
    updatedAt: requiredTimestamp(item, "updatedAt", "sandbox.updatedAt"),
  };
}

function validateContract(value: JsonRecord): void {
  if (value.contractVersion !== SANDBOX_CONTRACT_VERSION) throw new Error("invalid sandbox contract version");
  if (!Array.isArray(value.mountPolicy)) throw new Error("invalid sandbox.mountPolicy");
  for (const entry of value.mountPolicy) {
    const mount = record(entry, "sandbox.mountPolicy entry");
    requiredString(mount, "path", "sandbox.mountPolicy.path");
    requiredString(mount, "ownerScope", "sandbox.mountPolicy.ownerScope");
    requiredString(mount, "mode", "sandbox.mountPolicy.mode");
    requiredString(mount, "persistence", "sandbox.mountPolicy.persistence");
  }
}

function parseCatalog(value: unknown): SandboxCatalog {
  const item = record(value, "sandbox catalog");
  validateContract(item);
  if (!Array.isArray(item.sandboxes)) throw new Error("invalid sandbox.sandboxes");
  const sandboxes = item.sandboxes.map(parseSandboxRecord);
  const defaultSandbox = item.defaultSandbox === null ? null : parseSandboxRecord(item.defaultSandbox);
  return { sandboxes, defaultSandbox };
}

function parseDefault(value: unknown): SandboxRecord | undefined {
  const item = record(value, "sandbox default");
  validateContract(item);
  return item.sandbox === null ? undefined : parseSandboxRecord(item.sandbox);
}

function parseCreate(value: unknown): { sandbox: SandboxRecord; defaultSandbox: SandboxRecord | null } {
  const item = record(value, "sandbox create");
  validateContract(item);
  return {
    sandbox: parseSandboxRecord(item.sandbox),
    defaultSandbox: item.defaultSandbox === null ? null : parseSandboxRecord(item.defaultSandbox),
  };
}

function parseSandboxResponse(value: unknown): SandboxRecord {
  const item = record(value, "sandbox selection");
  validateContract(item);
  return parseSandboxRecord(item.sandbox);
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) return true;
  }
  return false;
}
