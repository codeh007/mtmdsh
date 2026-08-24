import { validateAdapterDescriptor, type AdapterDescriptor } from "./adapter.ts";
import type {
  BindingScope,
  CapabilityBinding,
  ConnectionRecord,
  ConnectionObservation,
  ConnectionInstance,
  MtmConnectSnapshot,
  WorldBinding,
} from "./connection.ts";
import { assertPublicConfig, isRecord, isJsonValue, type JsonObject } from "./json.ts";
import { EVENT_POLICIES, validateExternalEvent, type EventDisposition, type EventPolicy, type EventProjection, type EventRecord } from "./event.ts";

const DESIRED_STATES = ["disabled", "enabled"] as const;
const OBSERVED_STATES = ["configured", "authorizing", "enrolled", "connecting", "online", "degraded", "offline", "revoked"] as const;
const BINDING_SCOPES = ["profile", "sandbox", "session"] as const;
const PROJECTION_DISPOSITIONS = ["observed", "queued", "wake-agent", "approval-required", "dropped"] as const;
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(label + " contains unsupported field: " + key);
  }
}

function stringValue(value: unknown, label: string, pattern = /.+/): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256 || !pattern.test(value)) throw new Error(label + " is invalid");
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(label + " must be a non-negative safe integer");
  return value as number;
}

function oneOf<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (!values.includes(value as T)) throw new Error(label + " is invalid");
  return value as T;
}

function validateBinding(value: unknown, key: string, capabilityIds: ReadonlySet<string>): CapabilityBinding {
  if (!isRecord(value)) throw new Error("binding " + key + " must be an object");
  exactKeys(value, ["capabilityId", "enabled", "modelInvocable", "userInvocable", "eventPolicy"], "binding " + key);
  if (value.capabilityId !== key || !capabilityIds.has(key)) throw new Error("binding capability does not match adapter descriptor");
  if (typeof value.enabled !== "boolean" || typeof value.modelInvocable !== "boolean" || typeof value.userInvocable !== "boolean") throw new Error("binding policy flags are invalid");
  return {
    capabilityId: key,
    enabled: value.enabled,
    modelInvocable: value.modelInvocable,
    userInvocable: value.userInvocable,
    eventPolicy: oneOf(value.eventPolicy, EVENT_POLICIES, "binding eventPolicy"),
  };
}

function validateWorldBinding(value: unknown, capabilityIds: ReadonlySet<string>, primaryCapabilityId: string | undefined): WorldBinding {
  if (!isRecord(value)) throw new Error("worldBinding must be an object");
  exactKeys(value, ["capabilityId", "scope", "status"], "worldBinding");
  if (value.capabilityId !== primaryCapabilityId || !capabilityIds.has(String(value.capabilityId))) throw new Error("worldBinding must select the adapter primary-world capability");
  return {
    capabilityId: String(value.capabilityId),
    scope: oneOf(value.scope, BINDING_SCOPES, "worldBinding scope") as BindingScope,
    status: oneOf(value.status, ["selected", "not-selected"] as const, "worldBinding status"),
  };
}

function validateObservation(value: unknown, instance: ConnectionInstance): ConnectionObservation {
  if (!isRecord(value)) throw new Error("connection observation must be an object");
  exactKeys(value, ["status", "generation", "channelId", "lastSeenAt", "expiresAt", "lastError"], "connection observation");
  const status = oneOf(value.status, OBSERVED_STATES, "connection observation status");
  const generation = integerValue(value.generation, "connection generation");
  const channelId = value.channelId === undefined ? undefined : stringValue(value.channelId, "connection channelId", ID_PATTERN);
  const lastSeenAt = value.lastSeenAt === undefined ? undefined : integerValue(value.lastSeenAt, "connection lastSeenAt");
  const expiresAt = value.expiresAt === undefined ? undefined : integerValue(value.expiresAt, "connection expiresAt");
  if (status === "online" && (instance.desired !== "enabled" || channelId === undefined || lastSeenAt === undefined)) throw new Error("online connection must have enabled desired state and channel facts");
  if (status !== "online" && channelId !== undefined) throw new Error("offline connection cannot retain a channelId");
  if (status === "revoked" && instance.desired !== "disabled") throw new Error("revoked connection must be disabled");
  let lastError: ConnectionObservation["lastError"];
  if (value.lastError !== undefined) {
    if (!isRecord(value.lastError)) throw new Error("connection lastError must be an object");
    exactKeys(value.lastError, ["code", "message"], "connection lastError");
    lastError = { code: stringValue(value.lastError.code, "connection error code", ID_PATTERN), message: stringValue(value.lastError.message, "connection error message") };
  }
  return { status, generation, ...(channelId === undefined ? {} : { channelId }), ...(lastSeenAt === undefined ? {} : { lastSeenAt }), ...(expiresAt === undefined ? {} : { expiresAt }), ...(lastError === undefined ? {} : { lastError }) };
}

function validateConnection(value: unknown, index: number, ownerId: string, adapters: readonly AdapterDescriptor[]): ConnectionRecord {
  if (!isRecord(value) || !isRecord(value.instance) || !isRecord(value.observation)) throw new Error("connection[" + index + "] must be a record");
  exactKeys(value, ["instance", "observation"], "connection[" + index + "]");
  const raw = value.instance;
  exactKeys(raw, ["id", "ownerId", "adapterId", "label", "config", "desired", "bindings", "worldBinding", "fixture", "createdAt", "updatedAt"], "connection instance");
  const id = stringValue(raw.id, "connection id", ID_PATTERN);
  if (raw.ownerId !== ownerId) throw new Error("connection owner does not match snapshot owner");
  const adapterId = stringValue(raw.adapterId, "connection adapterId", ID_PATTERN);
  const adapter = adapters.find((candidate) => candidate.id === adapterId);
  if (adapter === undefined) throw new Error("connection references unknown adapter: " + adapterId);
  if (adapter.status !== "installed" && raw.desired !== "disabled") throw new Error("active connection references unavailable adapter");
  if (!isRecord(raw.config) || !Object.values(raw.config).every(isJsonValue)) throw new Error("connection config must be JSON-safe");
  const config = raw.config as JsonObject;
  assertPublicConfig(config);
  const desired = oneOf(raw.desired, DESIRED_STATES, "connection desired state");
  const label = stringValue(raw.label, "connection label");
  if (label.trim().length < 2 || label.trim().length > 80) throw new Error("connection label is invalid");
  if (typeof raw.fixture !== "boolean") throw new Error("connection fixture flag is invalid");
  const createdAt = integerValue(raw.createdAt, "connection createdAt");
  const updatedAt = integerValue(raw.updatedAt, "connection updatedAt");
  if (updatedAt < createdAt) throw new Error("connection updatedAt precedes createdAt");
  if (!isRecord(raw.bindings)) throw new Error("connection bindings must be an object");
  const capabilityIds = new Set(adapter.capabilities.map((capability) => capability.id));
  const bindingKeys = Object.keys(raw.bindings);
  if (bindingKeys.length !== capabilityIds.size || bindingKeys.some((key) => !capabilityIds.has(key))) throw new Error("connection bindings do not match adapter capabilities");
  const bindings: Record<string, CapabilityBinding> = {};
  for (const key of bindingKeys) bindings[key] = validateBinding(raw.bindings[key], key, capabilityIds);
  const primary = adapter.capabilities.find((capability) => capability.role === "primary-world")?.id;
  let worldBinding: WorldBinding | undefined;
  if (raw.worldBinding !== undefined) worldBinding = validateWorldBinding(raw.worldBinding, capabilityIds, primary);
  else if (primary !== undefined) throw new Error("primary-world connection must carry a worldBinding");
  const instance: ConnectionInstance = {
    id,
    ownerId,
    adapterId,
    label,
    config,
    desired,
    bindings,
    ...(worldBinding === undefined ? {} : { worldBinding }),
    fixture: raw.fixture,
    createdAt,
    updatedAt,
  };
  return { instance, observation: validateObservation(value.observation, instance) };
}

function validateProjection(value: unknown, event: ReturnType<typeof validateExternalEvent>): EventProjection {
  if (!isRecord(value)) throw new Error("event projection must be an object");
  exactKeys(value, ["eventId", "dedupeKey", "policy", "disposition", "reason"], "event projection");
  if (value.eventId !== event.eventId || value.dedupeKey !== event.dedupeKey) throw new Error("event projection identity does not match event");
  const projection: EventProjection = {
    eventId: event.eventId,
    dedupeKey: event.dedupeKey,
    policy: oneOf(value.policy, EVENT_POLICIES, "event projection policy") as EventPolicy,
    disposition: oneOf(value.disposition, PROJECTION_DISPOSITIONS, "event projection disposition") as EventDisposition,
    ...(value.reason === undefined ? {} : { reason: stringValue(value.reason, "event projection reason") }),
  };
  return projection;
}

function validateEventRecord(value: unknown, index: number, connections: readonly ConnectionRecord[]): EventRecord {
  if (!isRecord(value)) throw new Error("eventHistory[" + index + "] must be an object");
  exactKeys(value, ["event", "projection", "recordedAt"], "eventHistory[" + index + "]");
  const event = validateExternalEvent(value.event);
  const connection = connections.find((record) => record.instance.id === event.connectionId);
  if (connection === undefined) throw new Error("event references unknown connection");
  if (connection.instance.bindings[event.capabilityId] === undefined) throw new Error("event references unknown capability");
  return { event, projection: validateProjection(value.projection, event), recordedAt: integerValue(value.recordedAt, "event recordedAt") };
}

export function cloneSnapshot(snapshot: MtmConnectSnapshot): MtmConnectSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as MtmConnectSnapshot;
}

export function validateSnapshot(value: unknown): MtmConnectSnapshot {
  if (!isRecord(value)) throw new Error("mtm-connect snapshot must be an object");
  exactKeys(value, ["schemaVersion", "revision", "controlRevision", "ownerId", "adapters", "connections", "eventHistory", "updatedAt"], "mtm-connect snapshot");
  if (value.schemaVersion !== 1) throw new Error("unsupported mtm-connect snapshot version");
  const revision = integerValue(value.revision, "snapshot revision");
  const controlRevision = value.controlRevision === undefined ? undefined : integerValue(value.controlRevision, "snapshot control revision");
  const ownerId = stringValue(value.ownerId, "snapshot ownerId", ID_PATTERN);
  if (!Array.isArray(value.adapters) || !Array.isArray(value.connections) || !Array.isArray(value.eventHistory)) throw new Error("snapshot collections are invalid");
  const adapters: AdapterDescriptor[] = value.adapters.map(validateAdapterDescriptor);
  const adapterIds = new Set<string>();
  for (const adapter of adapters) {
    if (adapterIds.has(adapter.id)) throw new Error("duplicate adapter id: " + adapter.id);
    adapterIds.add(adapter.id);
  }
  const connections = value.connections.map((record, index) => validateConnection(record, index, ownerId, adapters));
  const connectionIds = new Set<string>();
  for (const connection of connections) {
    if (connectionIds.has(connection.instance.id)) throw new Error("duplicate connection id: " + connection.instance.id);
    connectionIds.add(connection.instance.id);
  }
  const eventHistory = value.eventHistory.map((event, index) => validateEventRecord(event, index, connections));
  return { schemaVersion: 1, revision, ...(controlRevision === undefined ? {} : { controlRevision }), ownerId, adapters, connections, eventHistory, updatedAt: integerValue(value.updatedAt, "snapshot updatedAt") };
}

export function asJsonSnapshot(snapshot: MtmConnectSnapshot): import("./json.ts").JsonValue {
  const validated = validateSnapshot(snapshot);
  return validated as unknown as import("./json.ts").JsonValue;
}
