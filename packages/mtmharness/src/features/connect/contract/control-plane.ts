import type { JsonObject } from "./json.ts";

export const MTM_CONTROL_CONTRACT_VERSION = 2 as const;
export const MTM_CONTROL_MAX_PUBLIC_CONFIG_BYTES = 8 * 1024;

export type MtmControlObservedStatus = "configured" | "authorizing" | "enrolled" | "connecting" | "online" | "degraded" | "offline" | "stale" | "revoked";
export type MtmControlInstallationStatus = "active" | "expired" | "revoked";
export type MtmControlEventPolicy = "observe" | "inject-next" | "wake-agent" | "require-approval" | "disabled";

export interface MtmControlScope {
  readonly sandboxId: string;
  readonly workspaceId: string;
  readonly owner: { readonly issuer: string; readonly subject: string };
}

/**
 * Secret-free reference to one tenant-owned model configuration revision.
 * Tenant authorization is established by the control authority before this
 * reference crosses the trusted Host bridge; mtmharness treats it as opaque.
 */
export interface MtmModelProfileRef {
  readonly tenantId: string;
  readonly profileId: string;
  readonly revision: number;
}

export interface MtmControlOperationDescriptor {
  readonly operationId: string;
  readonly sideEffect: "read" | "write";
  readonly requiresApproval: boolean;
}

export interface MtmControlCapabilityDescriptor {
  readonly capabilityId: string;
  readonly version: string;
  readonly role: "primary-world" | "additive-capability";
  readonly operations: readonly MtmControlOperationDescriptor[];
}

export interface MtmControlAdapterDescriptor {
  readonly adapterId: string;
  readonly version: string;
  readonly label: string;
  readonly available: boolean;
  readonly capabilities: readonly MtmControlCapabilityDescriptor[];
}

export interface MtmControlCapabilityPolicy {
  readonly capabilityId: string;
  readonly enabled: boolean;
  readonly modelInvocable: boolean;
  readonly userInvocable: boolean;
  readonly eventPolicy: MtmControlEventPolicy;
}

export interface MtmControlDesiredWorld {
  readonly worldId: string;
  readonly adapterId: string;
  readonly config: JsonObject;
  readonly enabled: boolean;
  readonly capabilities: Readonly<Record<string, MtmControlCapabilityPolicy>>;
}

export interface MtmControlObservedWorld {
  readonly worldId: string;
  readonly adapterId: string;
  readonly status: MtmControlObservedStatus;
  readonly generation: number;
  readonly channelId?: string;
  readonly lastSeenAt?: number;
  readonly lastError?: { readonly code: string; readonly message: string };
}

export interface MtmControlInstallation {
  readonly installationId: string;
  readonly daemonId: string;
  readonly generation: number;
  readonly status: MtmControlInstallationStatus;
  readonly boundAt: number;
  readonly heartbeatAt: number;
  readonly expiresAt: number;
  readonly revokedAt?: number;
}

export interface MtmControlSnapshot {
  readonly contractVersion: typeof MTM_CONTROL_CONTRACT_VERSION;
  readonly scope: MtmControlScope;
  readonly revision: number;
  readonly adapters: readonly MtmControlAdapterDescriptor[];
  readonly desiredWorlds: readonly MtmControlDesiredWorld[];
  readonly observedWorlds: readonly MtmControlObservedWorld[];
  readonly installation: MtmControlInstallation | null;
  readonly activeModelProfile: MtmModelProfileRef | null;
}

export function cloneMtmControlSnapshot(snapshot: MtmControlSnapshot): MtmControlSnapshot {
  validateMtmControlSnapshot(snapshot);
  return JSON.parse(JSON.stringify(snapshot)) as MtmControlSnapshot;
}

export function validateMtmControlSnapshot(value: unknown): asserts value is MtmControlSnapshot {
  if (!isRecord(value)) throw new Error("mtm control snapshot must be an object");
  exactKeys(value, ["contractVersion", "scope", "revision", "adapters", "desiredWorlds", "observedWorlds", "installation", "activeModelProfile"], "mtm control snapshot");
  if (value.contractVersion !== MTM_CONTROL_CONTRACT_VERSION || !isNonNegativeInteger(value.revision)) throw new Error("mtm control snapshot version or revision is invalid");
  validateScope(value.scope);
  if (!Array.isArray(value.adapters) || !Array.isArray(value.desiredWorlds) || !Array.isArray(value.observedWorlds)) throw new Error("mtm control snapshot collections are invalid");
  const adapters = value.adapters.map(validateAdapter);
  const adapterIds = new Set<string>();
  for (const adapter of adapters) {
    if (adapterIds.has(adapter.adapterId)) throw new Error("mtm control adapter is duplicated");
    adapterIds.add(adapter.adapterId);
  }
  const desiredIds = new Set<string>();
  const desiredById = new Map<string, MtmControlDesiredWorld>();
  for (const raw of value.desiredWorlds) {
    const desired = validateDesiredWorld(raw);
    if (desiredIds.has(desired.worldId) || !adapterIds.has(desired.adapterId)) throw new Error("mtm control desired world is invalid");
    desiredIds.add(desired.worldId);
    desiredById.set(desired.worldId, desired);
  }
  const observedIds = new Set<string>();
  for (const raw of value.observedWorlds) {
    const observed = validateObservedWorld(raw);
    const desired = desiredById.get(observed.worldId);
    if (observedIds.has(observed.worldId) || desired === undefined || desired.adapterId !== observed.adapterId) throw new Error("mtm control observed world is invalid");
    observedIds.add(observed.worldId);
  }
  if (value.installation !== null) validateInstallation(value.installation);
  if (value.activeModelProfile !== null) validateMtmModelProfileRef(value.activeModelProfile);
  assertSecretFree(value);
}

function validateScope(value: unknown): asserts value is MtmControlScope {
  if (!isRecord(value) || !isRecord(value.owner)) throw new Error("mtm control scope is invalid");
  exactKeys(value, ["sandboxId", "workspaceId", "owner"], "mtm control scope");
  exactKeys(value.owner, ["issuer", "subject"], "mtm control owner");
  identifier(value.sandboxId, "sandbox id");
  identifier(value.workspaceId, "workspace id");
  text(value.owner.issuer, "owner issuer", 512);
  text(value.owner.subject, "owner subject", 256);
}

function validateAdapter(value: unknown): MtmControlAdapterDescriptor {
  if (!isRecord(value) || !Array.isArray(value.capabilities)) throw new Error("mtm control adapter is invalid");
  exactKeys(value, ["adapterId", "version", "label", "available", "capabilities"], "mtm control adapter");
  const adapterId = identifier(value.adapterId, "adapter id");
  const version = text(value.version, "adapter version", 64);
  const label = text(value.label, "adapter label", 128);
  if (typeof value.available !== "boolean") throw new Error("mtm control adapter availability is invalid");
  const capabilityIds = new Set<string>();
  const capabilities = value.capabilities.map((raw) => {
    if (!isRecord(raw) || !Array.isArray(raw.operations)) throw new Error("mtm control capability is invalid");
    exactKeys(raw, ["capabilityId", "version", "role", "operations"], "mtm control capability");
    const capabilityId = identifier(raw.capabilityId, "capability id");
    if (capabilityIds.has(capabilityId)) throw new Error("mtm control capability is duplicated");
    capabilityIds.add(capabilityId);
    const role: "primary-world" | "additive-capability" = raw.role === "primary-world" || raw.role === "additive-capability"
      ? raw.role
      : (() => { throw new Error("mtm control capability role is invalid"); })();
    const capabilityVersion = text(raw.version, "capability version", 64);
    const operationIds = new Set<string>();
    const operations = raw.operations.map((operation) => {
      if (!isRecord(operation)) throw new Error("mtm control operation is invalid");
      exactKeys(operation, ["operationId", "sideEffect", "requiresApproval"], "mtm control operation");
      const operationId = identifier(operation.operationId, "operation id");
      if (operationIds.has(operationId)) throw new Error("mtm control operation is duplicated");
      operationIds.add(operationId);
      const sideEffect: "read" | "write" = operation.sideEffect === "read" || operation.sideEffect === "write"
        ? operation.sideEffect
        : (() => { throw new Error("mtm control operation side effect is invalid"); })();
      if (typeof operation.requiresApproval !== "boolean" || (sideEffect === "write" && !operation.requiresApproval)) throw new Error("mtm control operation approval is invalid");
      return { operationId, sideEffect, requiresApproval: operation.requiresApproval };
    });
    return { capabilityId, version: capabilityVersion, role, operations };
  });
  if (capabilities.filter((capability) => capability.role === "primary-world").length !== 1) throw new Error("mtm control adapter must declare one primary world");
  return { adapterId, version, label, available: value.available, capabilities };
}

function validateDesiredWorld(value: unknown): MtmControlDesiredWorld {
  if (!isRecord(value) || !isRecord(value.config) || !isRecord(value.capabilities)) throw new Error("mtm control desired world is invalid");
  exactKeys(value, ["worldId", "adapterId", "config", "enabled", "capabilities"], "mtm control desired world");
  const worldId = identifier(value.worldId, "world id");
  const adapterId = identifier(value.adapterId, "adapter id");
  if (typeof value.enabled !== "boolean") throw new Error("mtm control desired state is invalid");
  assertPublicConfig(value.config);
  const capabilities: Record<string, MtmControlCapabilityPolicy> = {};
  for (const [key, raw] of Object.entries(value.capabilities)) {
    identifier(key, "capability policy id");
    if (!isRecord(raw) || raw.capabilityId !== key || typeof raw.enabled !== "boolean" || typeof raw.modelInvocable !== "boolean" || typeof raw.userInvocable !== "boolean") throw new Error("mtm control capability policy is invalid");
    exactKeys(raw, ["capabilityId", "enabled", "modelInvocable", "userInvocable", "eventPolicy"], "mtm control capability policy");
    if (!isEventPolicy(raw.eventPolicy)) throw new Error("mtm control event policy is invalid");
    capabilities[key] = { capabilityId: key, enabled: raw.enabled, modelInvocable: raw.modelInvocable, userInvocable: raw.userInvocable, eventPolicy: raw.eventPolicy };
  }
  return { worldId, adapterId, config: value.config as JsonObject, enabled: value.enabled, capabilities };
}

function validateObservedWorld(value: unknown): MtmControlObservedWorld {
  if (!isRecord(value)) throw new Error("mtm control observed world is invalid");
  exactKeys(value, ["worldId", "adapterId", "status", "generation", "channelId", "lastSeenAt", "lastError"], "mtm control observed world");
  const worldId = identifier(value.worldId, "world id");
  const adapterId = identifier(value.adapterId, "adapter id");
  if (!isObservedStatus(value.status) || !isNonNegativeInteger(value.generation)) throw new Error("mtm control observed world is invalid");
  if (value.channelId !== undefined) identifier(value.channelId, "channel id");
  if (value.lastSeenAt !== undefined && !isNonNegativeInteger(value.lastSeenAt)) throw new Error("mtm control observed timestamp is invalid");
  if (value.status === "online" && (value.channelId === undefined || value.lastSeenAt === undefined)) throw new Error("mtm control online world is missing channel facts");
  if (value.status !== "online" && value.channelId !== undefined) throw new Error("mtm control offline world has a channel");
  if (value.lastError !== undefined) {
    if (!isRecord(value.lastError)) throw new Error("mtm control observed error is invalid");
    exactKeys(value.lastError, ["code", "message"], "mtm control observed error");
    identifier(value.lastError.code, "observed error code");
    text(value.lastError.message, "observed error message", 240);
  }
  return value as unknown as MtmControlObservedWorld;
}

export function validateMtmModelProfileRef(value: unknown): asserts value is MtmModelProfileRef {
  if (!isRecord(value)) throw new Error("mtm model profile is invalid");
  exactKeys(value, ["tenantId", "profileId", "revision"], "mtm model profile");
  identifier(value.tenantId, "model profile tenant id");
  identifier(value.profileId, "model profile id");
  if (!isNonNegativeInteger(value.revision) || value.revision < 1) throw new Error("model profile revision is invalid");
}

function validateInstallation(value: unknown): void {
  if (!isRecord(value)) throw new Error("mtm control installation is invalid");
  exactKeys(value, ["installationId", "daemonId", "generation", "status", "boundAt", "heartbeatAt", "expiresAt", "revokedAt"], "mtm control installation");
  identifier(value.installationId, "installation id");
  identifier(value.daemonId, "daemon id");
  if (!isNonNegativeInteger(value.generation) || !isNonNegativeInteger(value.boundAt) || !isNonNegativeInteger(value.heartbeatAt) || !isNonNegativeInteger(value.expiresAt)) throw new Error("mtm control installation timestamps are invalid");
  if (value.heartbeatAt < value.boundAt || value.expiresAt < value.heartbeatAt) throw new Error("mtm control installation timestamp order is invalid");
  if (value.status !== "active" && value.status !== "expired" && value.status !== "revoked") throw new Error("mtm control installation status is invalid");
  if (value.status === "revoked" && value.revokedAt === undefined) throw new Error("mtm control revoked timestamp is invalid");
  if (value.status !== "revoked" && value.revokedAt !== undefined) throw new Error("mtm control revoked timestamp is invalid");
  if (value.revokedAt !== undefined && !isNonNegativeInteger(value.revokedAt)) throw new Error("mtm control revoked timestamp is invalid");
}

function assertPublicConfig(value: unknown): asserts value is JsonObject {
  assertSecretFree(value);
  const serialized = JSON.stringify(value);
  if (serialized === undefined || serialized.length > MTM_CONTROL_MAX_PUBLIC_CONFIG_BYTES) throw new Error("mtm control public config is too large");
}

function assertSecretFree(value: unknown): void {
  if (value === null || typeof value === "number" || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (/\bBearer\s+\S+|-----BEGIN [A-Z ]+-----|(?:access[_-]?token|refresh[_-]?token|api[_-]?key|client[_-]?secret)\s*[:=]\s*\S+/iu.test(value)) throw new Error("mtm control secret is not allowed");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertSecretFree);
    return;
  }
  if (!isRecord(value)) throw new Error("mtm control JSON is invalid");
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|credential|private[_ -]?key|privatekey|api[_ -]?key|apikey|authorization|cookie|passphrase|oauth|session)/iu.test(key)) throw new Error("mtm control secret is not allowed");
    assertSecretFree(child);
  }
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(label + " contains unsupported field: " + key);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) throw new Error(label + " is invalid");
  return value;
}

function text(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(label + " is invalid");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isObservedStatus(value: unknown): value is MtmControlObservedStatus {
  return value === "configured" || value === "authorizing" || value === "enrolled" || value === "connecting" || value === "online" || value === "degraded" || value === "offline" || value === "stale" || value === "revoked";
}

function isEventPolicy(value: unknown): value is MtmControlEventPolicy {
  return value === "observe" || value === "inject-next" || value === "wake-agent" || value === "require-approval" || value === "disabled";
}
