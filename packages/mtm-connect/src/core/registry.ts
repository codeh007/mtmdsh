import { createAdapterCatalog } from "../adapters/catalog.ts";
import { invokeMockCapability, type MockInvocationResult } from "../adapters/mock/invoke.ts";
import { adapterCapability, createConnectionRecord, type BindingScope, type CapabilityInvocationResult, type ConnectionRecord, type ConnectionSeed, type MtmConnectMutation, type MtmConnectInvocationRequest, type MtmConnectSnapshot } from "../contract/connection.ts";
import { projectExternalEvent, validateExternalEvent, type EventPolicy, type EventProjection, type ExternalConnectionEvent, type EventRecord } from "../contract/event.ts";
import { assertPublicConfig, jsonByteLength, type JsonObject } from "../contract/json.ts";
import { cloneSnapshot, validateSnapshot } from "../contract/snapshot.ts";
import { validateAdapterDescriptor, type AdapterDescriptor } from "../contract/adapter.ts";

export type InvocationActor = "model" | "user";

export interface MtmConnectRegistryOptions {
  readonly ownerId: string;
  readonly now?: () => number;
  readonly adapters?: readonly AdapterDescriptor[];
  readonly seed?: boolean;
  readonly snapshot?: MtmConnectSnapshot;
}

export type RegistryListener = () => void;

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requiredLabel(label: string): string {
  const value = label.trim();
  if (value.length < 2 || value.length > 80) throw new Error("connection label must be between 2 and 80 characters");
  return value;
}

function adapterFor(adapters: readonly AdapterDescriptor[], id: string): AdapterDescriptor {
  const adapter = adapters.find((candidate) => candidate.id === id);
  if (adapter === undefined) throw new Error("adapter not found: " + id);
  return adapter;
}

function replaceConnection(
  snapshot: MtmConnectSnapshot,
  connectionId: string,
  update: (record: ConnectionRecord) => ConnectionRecord,
): MtmConnectSnapshot {
  let found = false;
  const connections = snapshot.connections.map((record) => {
    if (record.instance.id !== connectionId) return record;
    found = true;
    return update(record);
  });
  if (!found) throw new Error("connection not found: " + connectionId);
  return { ...snapshot, connections };
}

function droppedProjection(
  event: ExternalConnectionEvent,
  policy: EventPolicy,
  reason: string,
): EventProjection {
  return { eventId: event.eventId, dedupeKey: event.dedupeKey, policy, disposition: "dropped", reason };
}

function defaultSeeds(ownerId: string, adapters: readonly AdapterDescriptor[], now: number): ConnectionRecord[] {
  const seeds: Array<{ adapterId: string; seed: ConnectionSeed }> = [
    {
      adapterId: "mock-world",
      seed: {
        id: "mock-workstation",
        label: "Local workstation (fixture)",
        config: { root: "/workspace/demo", transport: "in-memory" },
        fixture: true,
        scope: "sandbox",
      },
    },
    {
      adapterId: "mock-device",
      seed: {
        id: "mock-android",
        label: "Android test device (fixture)",
        config: { model: "Pixel 8 fixture", transport: "in-memory" },
        fixture: true,
      },
    },
  ];
  return seeds
    .map(({ adapterId, seed }) => {
      const adapter = adapters.find((candidate) => candidate.id === adapterId && candidate.status === "installed");
      return adapter === undefined ? undefined : createConnectionRecord(ownerId, adapter, seed, now);
    })
    .filter((record): record is ConnectionRecord => record !== undefined);
}

export class MtmConnectRegistry {
  private snapshot: MtmConnectSnapshot;
  private readonly listeners = new Set<RegistryListener>();
  private readonly now: () => number;
  private disposed = false;
  private sequence = 1;

  constructor(options: MtmConnectRegistryOptions) {
    if (options.ownerId.trim().length === 0) throw new Error("mtm-connect ownerId is required");
    this.now = options.now ?? (() => Date.now());
    if (options.snapshot !== undefined) {
      const restored = validateSnapshot(options.snapshot);
      if (restored.ownerId !== options.ownerId) throw new Error("snapshot owner does not match registry owner");
      this.snapshot = cloneSnapshot(restored);
      this.syncSequence();
      return;
    }
    const adapters = (options.adapters ?? createAdapterCatalog()).map((adapter) => validateAdapterDescriptor(copy(adapter)));
    const createdAt = this.now();
    this.snapshot = {
      schemaVersion: 1,
      revision: 0,
      ownerId: options.ownerId,
      adapters,
      connections: options.seed === false ? [] : defaultSeeds(options.ownerId, adapters, createdAt),
      eventHistory: [],
      updatedAt: createdAt,
    };
  }

  getSnapshot = (): MtmConnectSnapshot => cloneSnapshot(this.snapshot);

  getAdapter(adapterId: string): AdapterDescriptor | undefined {
    const adapter = this.snapshot.adapters.find((candidate) => candidate.id === adapterId);
    return adapter === undefined ? undefined : copy(adapter);
  }

  getConnection(connectionId: string): ConnectionRecord | undefined {
    const record = this.snapshot.connections.find((candidate) => candidate.instance.id === connectionId);
    return record === undefined ? undefined : copy(record);
  }

  subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  createConnection(
    adapterId: string,
    label: string,
    config: JsonObject = {},
    scope: BindingScope = "sandbox",
  ): ConnectionRecord {
    this.ensureActive();
    const adapter = adapterFor(this.snapshot.adapters, adapterId);
    if (adapter.status !== "installed") throw new Error("adapter is unavailable: " + adapterId);
    assertPublicConfig(config);
    const id = this.nextConnectionId(adapterId);
    const now = this.now();
    const record = createConnectionRecord(this.snapshot.ownerId, adapter, {
      id,
      label: requiredLabel(label),
      config: copy(config),
      fixture: true,
      scope,
    }, now);
    this.commit((snapshot) => ({ ...snapshot, connections: [...snapshot.connections, record] }));
    return copy(record);
  }

  enable(connectionId: string): void {
    this.ensureActive();
    const now = this.now();
    this.commit((snapshot) => replaceConnection(snapshot, connectionId, (record) => {
      if (record.observation.status === "revoked") throw new Error("revoked connection cannot be enabled");
      if (!record.instance.fixture) throw new Error("real adapter setup is not implemented in this release");
      const adapter = snapshot.adapters.find((candidate) => candidate.id === record.instance.adapterId);
      if (adapter === undefined || adapter.status !== "installed") throw new Error("adapter is unavailable: " + record.instance.adapterId);
      const generation = record.observation.generation + 1;
      return {
        instance: { ...record.instance, desired: "enabled", updatedAt: now },
        observation: {
          status: "online",
          generation,
          channelId: connectionId + ":channel:" + generation,
          lastSeenAt: now,
        },
      };
    }));
  }

  disable(connectionId: string): void {
    this.ensureActive();
    const now = this.now();
    this.commit((snapshot) => replaceConnection(snapshot, connectionId, (record) => {
      if (record.observation.status === "revoked") return record;
      return {
        instance: { ...record.instance, desired: "disabled", updatedAt: now },
        observation: { status: "offline", generation: record.observation.generation + 1 },
      };
    }));
  }

  revoke(connectionId: string): void {
    this.ensureActive();
    const now = this.now();
    this.commit((snapshot) => replaceConnection(snapshot, connectionId, (record) => ({
      instance: { ...record.instance, desired: "disabled", updatedAt: now },
      observation: {
        status: "revoked",
        generation: record.observation.generation + 1,
        lastError: { code: "revoked", message: "Connection was revoked by the owner" },
      },
    })));
  }

  reconnect(connectionId: string): void {
    const record = this.requireConnection(connectionId);
    if (record.instance.desired !== "enabled") throw new Error("connection must be enabled before reconnecting");
    this.enable(connectionId);
  }

  setCapabilityPolicy(
    connectionId: string,
    capabilityId: string,
    patch: Partial<Pick<ConnectionRecord["instance"]["bindings"][string], "enabled" | "modelInvocable" | "userInvocable" | "eventPolicy">>,
  ): void {
    this.ensureActive();
    if (patch.eventPolicy !== undefined && !["observe", "inject-next", "wake-agent", "require-approval", "disabled"].includes(patch.eventPolicy)) throw new Error("invalid event policy");
    if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") throw new Error("enabled policy must be boolean");
    if (patch.modelInvocable !== undefined && typeof patch.modelInvocable !== "boolean") throw new Error("modelInvocable policy must be boolean");
    if (patch.userInvocable !== undefined && typeof patch.userInvocable !== "boolean") throw new Error("userInvocable policy must be boolean");
    const now = this.now();
    this.commit((snapshot) => replaceConnection(snapshot, connectionId, (record) => {
      const binding = record.instance.bindings[capabilityId];
      if (binding === undefined) throw new Error("capability binding not found: " + capabilityId);
      return {
        ...record,
        instance: {
          ...record.instance,
          updatedAt: now,
          bindings: { ...record.instance.bindings, [capabilityId]: { ...binding, ...patch } },
        },
      };
    }));
  }

  dispatchExternalEvent(connectionId: string, eventInput: ExternalConnectionEvent): EventProjection {
    this.ensureActive();
    const event = validateExternalEvent(eventInput);
    const record = this.requireConnection(connectionId);
    const binding = record.instance.bindings[event.capabilityId];
    const policy = binding?.eventPolicy ?? "disabled";
    let projection: EventProjection;
    if (event.connectionId !== connectionId) projection = droppedProjection(event, policy, "connection-id-mismatch");
    else if (record.observation.status !== "online") projection = droppedProjection(event, policy, "connection-offline");
    else if (event.generation !== record.observation.generation) projection = droppedProjection(event, policy, "stale-generation");
    else if (binding === undefined || !binding.enabled) projection = droppedProjection(event, policy, "capability-disabled");
    else {
      const seen = new Set(recordedDedupeKeys(this.snapshot.eventHistory));
      projection = projectExternalEvent(event, policy, seen);
    }
    const eventRecord: EventRecord = { event, projection, recordedAt: this.now() };
    this.commit((snapshot) => ({ ...snapshot, eventHistory: [...snapshot.eventHistory, eventRecord] }));
    return projection;
  }

  applyMutation(mutation: MtmConnectMutation): { readonly snapshot: MtmConnectSnapshot; readonly projection?: EventProjection } {
    switch (mutation.type) {
      case "create":
        this.createConnection(mutation.adapterId, mutation.label, mutation.config, mutation.scope ?? "sandbox");
        return { snapshot: this.getSnapshot() };
      case "enable":
        this.enable(mutation.connectionId);
        return { snapshot: this.getSnapshot() };
      case "disable":
        this.disable(mutation.connectionId);
        return { snapshot: this.getSnapshot() };
      case "revoke":
        this.revoke(mutation.connectionId);
        return { snapshot: this.getSnapshot() };
      case "reconnect":
        this.reconnect(mutation.connectionId);
        return { snapshot: this.getSnapshot() };
      case "set-policy":
        this.setCapabilityPolicy(mutation.connectionId, mutation.capabilityId, mutation.patch);
        return { snapshot: this.getSnapshot() };
      case "event": {
        const projection = this.dispatchExternalEvent(mutation.connectionId, mutation.event);
        return { snapshot: this.getSnapshot(), projection };
      }
    }
  }

  invokeCapability(
    connectionId: string,
    generation: number,
    capabilityId: string,
    operationId: string,
    input: JsonObject,
    actor: InvocationActor,
    approved = false,
  ): CapabilityInvocationResult {
    this.ensureActive();
    const record = this.snapshot.connections.find((candidate) => candidate.instance.id === connectionId);
    if (record === undefined) return { ok: false, code: "connection-not-found", message: "Connection does not exist" };
    if (record.observation.status !== "online") return { ok: false, code: "connection-offline", message: "Connection is not online" };
    if (generation !== record.observation.generation) return { ok: false, code: "stale-generation", message: "Connection channel generation is stale" };
    const binding = record.instance.bindings[capabilityId];
    if (binding === undefined) return { ok: false, code: "capability-not-found", message: "Capability is not declared by this connection" };
    if (!binding.enabled) return { ok: false, code: "capability-disabled", message: "Capability is disabled for this connection" };
    if (actor === "model" && !binding.modelInvocable) return { ok: false, code: "policy-denied", message: "Model invocation is disabled by connection policy" };
    if (actor === "user" && !binding.userInvocable) return { ok: false, code: "policy-denied", message: "User invocation is disabled by connection policy" };
    const adapter = this.snapshot.adapters.find((candidate) => candidate.id === record.instance.adapterId);
    if (adapter === undefined || adapter.status !== "installed") return { ok: false, code: "adapter-unavailable", message: "Adapter is unavailable" };
    const capability = adapterCapability(adapter, capabilityId);
    const operation = capability?.operations.find((candidate) => candidate.id === operationId);
    if (capability === undefined || operation === undefined) return { ok: false, code: "unsupported-operation", message: "The selected operation is not declared" };
    if (operation.requiresApproval && (actor !== "user" || !approved)) return { ok: false, code: "approval-required", message: "This operation requires explicit user approval" };
    if (jsonByteLength(input) > capability.limits.maxInputBytes) return { ok: false, code: "input-too-large", message: "Invocation input exceeds the capability limit" };
    const result: MockInvocationResult = invokeMockCapability(adapter.id, capabilityId, operationId, input);
    if (!result.ok) return result;
    if (jsonByteLength(result.data) > capability.limits.maxOutputBytes) return { ok: false, code: "output-too-large", message: "Invocation output exceeds the capability limit" };
    return {
      ok: true,
      simulated: true,
      adapterId: adapter.id,
      connectionId,
      generation,
      capabilityId,
      operationId,
      summary: result.summary,
      data: result.data,
    };
  }

  invoke(request: MtmConnectInvocationRequest): CapabilityInvocationResult {
    return this.invokeCapability(
      request.connectionId,
      request.generation,
      request.capabilityId,
      request.operationId,
      request.input,
      request.actor,
      request.approved ?? false,
    );
  }

  restoreSnapshot(snapshotInput: MtmConnectSnapshot): void {
    this.ensureActive();
    const snapshot = validateSnapshot(snapshotInput);
    if (snapshot.ownerId !== this.snapshot.ownerId) throw new Error("snapshot owner does not match registry owner");
    if (snapshot.revision <= this.snapshot.revision) throw new Error("stale mtm-connect snapshot revision");
    for (const current of this.snapshot.connections) {
      const incoming = snapshot.connections.find((record) => record.instance.id === current.instance.id);
      if (incoming === undefined) continue;
      if (incoming.observation.generation < current.observation.generation) throw new Error("stale mtm-connect connection generation");
      if (current.observation.status === "online" && incoming.observation.generation === current.observation.generation
        && incoming.observation.channelId !== current.observation.channelId) {
        throw new Error("mtm-connect snapshot replaces an active channel without a new generation");
      }
    }
    this.snapshot = cloneSnapshot(snapshot);
    this.syncSequence();
    this.notify();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
  }

  private nextConnectionId(adapterId: string): string {
    let id: string;
    do {
      id = adapterId + "-connection-" + this.sequence++;
    } while (this.snapshot.connections.some((record) => record.instance.id === id));
    return id;
  }

  private syncSequence(): void {
    let maximum = this.sequence - 1;
    for (const record of this.snapshot.connections) {
      const match = record.instance.id.match(/-connection-(\d+)$/);
      if (match !== null) maximum = Math.max(maximum, Number(match[1]));
    }
    this.sequence = maximum + 1;
  }

  private requireConnection(connectionId: string): ConnectionRecord {
    const record = this.snapshot.connections.find((candidate) => candidate.instance.id === connectionId);
    if (record === undefined) throw new Error("connection not found: " + connectionId);
    return record;
  }

  private commit(update: (snapshot: MtmConnectSnapshot) => MtmConnectSnapshot): void {
    this.ensureActive();
    const next = update(cloneSnapshot(this.snapshot));
    this.snapshot = { ...next, revision: this.snapshot.revision + 1, updatedAt: this.now() };
    this.notify();
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("mtm-connect registry has been disposed");
  }
}

function recordedDedupeKeys(history: readonly EventRecord[]): string[] {
  return history.map((record) => record.event.dedupeKey);
}

export function createDemoRegistry(now?: () => number): MtmConnectRegistry {
  return new MtmConnectRegistry({ ownerId: "demo-user", now, seed: true });
}
