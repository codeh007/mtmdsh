import { createAdapterCatalog } from "../adapters/catalog.ts";
import { mockCapabilityInvoker } from "../adapters/mock/invoke.ts";
import type { CapabilityInvocationContext, CapabilityInvocationExecutionResult, CapabilityInvoker } from "../adapters/invoker.ts";
import { adapterCapability, createConnectionRecord, type BindingScope, type CapabilityInvocationResult, type ConnectionRecord, type ConnectionSeed, type MtmConnectMutation, type MtmConnectInvocationRequest, type MtmConnectSnapshot } from "../contract/connection.ts";
import { projectExternalEvent, validateExternalEvent, type EventPolicy, type EventProjection, type ExternalConnectionEvent, type EventRecord } from "../contract/event.ts";
import { assertPublicConfig, isJsonValue, isRecord, jsonByteLength, type JsonObject } from "../contract/json.ts";
import { cloneSnapshot, validateSnapshot } from "../contract/snapshot.ts";
import { validateAdapterDescriptor, type AdapterDescriptor } from "../contract/adapter.ts";
import { validateMtmControlSnapshot, type MtmControlAdapterDescriptor, type MtmControlInstallationStatus, type MtmControlObservedStatus, type MtmControlScope, type MtmControlSnapshot } from "../contract/control-plane.ts";

export type InvocationActor = "model" | "user";

export interface MtmConnectRegistryOptions {
  readonly ownerId: string;
  readonly now?: () => number;
  readonly adapters?: readonly AdapterDescriptor[];
  /** Executes an already policy-checked capability without owning policy decisions. */
  readonly capabilityInvoker?: CapabilityInvoker;
  readonly seed?: boolean;
  readonly snapshot?: MtmConnectSnapshot;
  /** Immutable sandbox scope used when projecting the remote control authority. */
  readonly scope?: MtmControlScope;
}

export type RegistryListener = () => void;

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function adapterFailure(): CapabilityInvocationExecutionResult {
  return { ok: false, code: "adapter-unavailable", message: "Adapter execution failed" };
}

async function invokeCapabilitySafely(invoker: CapabilityInvoker, context: CapabilityInvocationContext): Promise<CapabilityInvocationExecutionResult> {
  let raw: unknown;
  try {
    raw = await invoker(context);
  } catch {
    return adapterFailure();
  }
  if (!isRecord(raw) || typeof raw.ok !== "boolean") return adapterFailure();
  if (raw.ok) {
    if (typeof raw.simulated !== "boolean" || typeof raw.summary !== "string" || !isRecord(raw.data) || !Object.values(raw.data).every(isJsonValue)) {
      return adapterFailure();
    }
    return { ok: true, simulated: raw.simulated, summary: raw.summary, data: raw.data as JsonObject };
  }
  if ((raw.code !== "adapter-unavailable" && raw.code !== "unsupported-operation" && raw.code !== "invalid-input") || typeof raw.message !== "string") {
    return adapterFailure();
  }
  return { ok: false, code: raw.code, message: raw.message };
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
  private readonly capabilityInvoker: CapabilityInvoker;
  private disposed = false;
  private sequence = 1;
  private controlScope: MtmControlScope | undefined;
  private controlRevision = -1;

  constructor(options: MtmConnectRegistryOptions) {
    if (options.ownerId.trim().length === 0) throw new Error("mtm-connect ownerId is required");
    this.now = options.now ?? (() => Date.now());
    this.capabilityInvoker = options.capabilityInvoker ?? mockCapabilityInvoker;
    this.controlScope = options.scope === undefined ? undefined : cloneControlScope(options.scope);
    if (options.snapshot !== undefined) {
      const restored = validateSnapshot(options.snapshot);
      if (restored.ownerId !== options.ownerId) throw new Error("snapshot owner does not match registry owner");
      this.snapshot = cloneSnapshot(restored);
      this.controlRevision = restored.controlRevision ?? -1;
      this.syncSequence();
      return;
    }
    const adapters = (options.adapters ?? createAdapterCatalog()).map((adapter) => validateAdapterDescriptor(copy(adapter)));
    const createdAt = this.now();
    this.snapshot = {
      schemaVersion: 2,
      revision: 0,
      ownerId: options.ownerId,
      adapters,
      connections: options.seed === false ? [] : defaultSeeds(options.ownerId, adapters, createdAt),
      activeModelProfile: null,
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

  getControlRevision(): number {
    return this.controlRevision;
  }

  /** Apply a remote sandbox snapshot to the local adapter registry. */
  reconcileControlSnapshot(input: MtmControlSnapshot): MtmConnectSnapshot {
    this.ensureActive();
    validateMtmControlSnapshot(input);
    if (this.controlScope === undefined) throw new Error("control snapshot scope is not bound to registry");
    if (input.scope.owner.subject !== this.snapshot.ownerId) throw new Error("control snapshot owner does not match registry owner");
    if (this.controlScope !== undefined && !sameControlScope(this.controlScope, input.scope)) throw new Error("control snapshot scope does not match registry scope");
    if (input.revision <= this.controlRevision) return this.getSnapshot();
    const connections = input.desiredWorlds.map((world) => this.projectControlWorld(input, world.worldId));
    for (const incoming of connections) {
      const current = this.snapshot.connections.find((record) => record.instance.id === incoming.instance.id);
      if (current === undefined) continue;
      if (incoming.observation.generation < current.observation.generation) throw new Error("control projection generation is stale");
      if (current.observation.status === "online" && incoming.observation.status === "online"
        && incoming.observation.generation === current.observation.generation
        && incoming.observation.channelId !== current.observation.channelId) {
        throw new Error("control projection replaces an active channel without a new generation");
      }
    }
    const connectionIds = new Set(connections.map((record) => record.instance.id));
    this.commit((snapshot) => ({
      ...snapshot,
      controlRevision: input.revision,
      activeModelProfile: input.activeModelProfile ?? null,
      connections,
      eventHistory: snapshot.eventHistory.filter((record) => connectionIds.has(record.event.connectionId)),
    }));
    this.controlScope = cloneControlScope(input.scope);
    this.controlRevision = input.revision;
    return this.getSnapshot();
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

  private projectControlWorld(input: MtmControlSnapshot, worldId: string): ConnectionRecord {
    const world = input.desiredWorlds.find((candidate) => candidate.worldId === worldId);
    if (world === undefined) throw new Error("control projection world is missing");
    const controlAdapter = input.adapters.find((candidate) => candidate.adapterId === world.adapterId);
    const adapter = this.snapshot.adapters.find((candidate) => candidate.id === world.adapterId);
    if (controlAdapter === undefined || adapter === undefined) throw new Error("control projection adapter is unavailable");
    if (!controlAdapter.available || adapter.status !== "installed") throw new Error("control projection adapter is unavailable");
    assertControlAdapterCompatibility(controlAdapter, adapter);
    const policyIds = Object.keys(world.capabilities);
    if (policyIds.length !== adapter.capabilities.length || adapter.capabilities.some((capability) => world.capabilities[capability.id] === undefined)) {
      throw new Error("control projection capability policy is incomplete");
    }
    const existing = this.snapshot.connections.find((candidate) => candidate.instance.id === world.worldId);
    const createdAt = existing?.instance.createdAt ?? this.now();
    const updatedAt = this.now();
    const bindings: Record<string, ConnectionRecord["instance"]["bindings"][string]> = {};
    for (const capability of adapter.capabilities) {
      const policy = world.capabilities[capability.id];
      if (policy === undefined) throw new Error("control projection capability policy is incomplete");
      bindings[capability.id] = {
        capabilityId: capability.id,
        enabled: policy.enabled,
        modelInvocable: policy.modelInvocable,
        userInvocable: policy.userInvocable,
        eventPolicy: policy.eventPolicy,
      };
    }
    const primary = adapter.capabilities.find((capability) => capability.role === "primary-world");
    const observed = input.observedWorlds.find((candidate) => candidate.worldId === world.worldId);
    const generation = input.installation?.generation ?? observed?.generation ?? 0;
    if (observed !== undefined && observed.generation !== generation) throw new Error("control projection generation mismatch");
    const observedStatus = controlObservedStatus(observed?.status ?? "configured", input.installation?.status, input.installation?.expiresAt, this.now());
    return {
      instance: {
        id: world.worldId,
        ownerId: this.snapshot.ownerId,
        adapterId: adapter.id,
        label: existing?.instance.label ?? world.worldId,
        config: copy(world.config),
        desired: world.enabled ? "enabled" : "disabled",
        bindings,
        ...(primary === undefined ? {} : { worldBinding: { capabilityId: primary.id, scope: existing?.instance.worldBinding?.scope ?? "sandbox", status: "selected" as const } }),
        fixture: existing?.instance.fixture ?? true,
        createdAt,
        updatedAt,
      },
      observation: observed === undefined
        ? { status: observedStatus, generation, ...(input.installation?.expiresAt === undefined ? {} : { expiresAt: input.installation.expiresAt }) }
        : {
            status: observedStatus,
            generation,
            ...(input.installation?.expiresAt === undefined ? {} : { expiresAt: input.installation.expiresAt }),
            ...(observedStatus === "online" && observed.channelId !== undefined && observed.lastSeenAt !== undefined
              ? { channelId: observed.channelId, lastSeenAt: observed.lastSeenAt }
              : {}),
            ...(observed.lastError === undefined ? {} : { lastError: observed.lastError }),
          },
    };
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
    else if (record.observation.expiresAt !== undefined && record.observation.expiresAt <= this.now()) projection = droppedProjection(event, policy, "connection-offline");
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

  async invokeCapability(
    connectionId: string,
    generation: number,
    capabilityId: string,
    operationId: string,
    input: JsonObject,
    actor: InvocationActor,
    approved = false,
  ): Promise<CapabilityInvocationResult> {
    this.ensureActive();
    const record = this.snapshot.connections.find((candidate) => candidate.instance.id === connectionId);
    if (record === undefined) return { ok: false, code: "connection-not-found", message: "Connection does not exist" };
    if (record.observation.status !== "online") return { ok: false, code: "connection-offline", message: "Connection is not online" };
    if (record.observation.expiresAt !== undefined && record.observation.expiresAt <= this.now()) return { ok: false, code: "connection-offline", message: "Connection installation has expired" };
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
    const result = await invokeCapabilitySafely(this.capabilityInvoker, {
      adapter: copy(adapter),
      capability: copy(capability),
      operation: copy(operation),
      connection: copy(record.instance),
      ...(this.snapshot.activeModelProfile === undefined || this.snapshot.activeModelProfile === null
        ? {}
        : { modelProfile: copy(this.snapshot.activeModelProfile) }),
      input: copy(input),
    });
    if (!result.ok) return result;
    if (jsonByteLength(result.data) > capability.limits.maxOutputBytes) return { ok: false, code: "output-too-large", message: "Invocation output exceeds the capability limit" };
    return {
      ok: true,
      simulated: result.simulated,
      adapterId: adapter.id,
      connectionId,
      generation,
      capabilityId,
      operationId,
      summary: result.summary,
      data: result.data,
    };
  }

  async invoke(request: MtmConnectInvocationRequest): Promise<CapabilityInvocationResult> {
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
    if (snapshot.controlRevision !== undefined && snapshot.controlRevision < this.controlRevision) throw new Error("stale mtm-connect control revision");
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
    if (snapshot.controlRevision !== undefined) this.controlRevision = snapshot.controlRevision;
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

function cloneControlScope(scope: MtmControlScope): MtmControlScope {
  return copy(scope);
}

function sameControlScope(left: MtmControlScope, right: MtmControlScope): boolean {
  return left.sandboxId === right.sandboxId
    && left.workspaceId === right.workspaceId
    && left.owner.issuer === right.owner.issuer
    && left.owner.subject === right.owner.subject;
}

function controlObservedStatus(
  status: MtmControlObservedStatus,
  installationStatus: MtmControlInstallationStatus | undefined,
  expiresAt: number | undefined,
  now: number,
): ConnectionRecord["observation"]["status"] {
  if (status === "revoked" || installationStatus === "revoked") return "revoked";
  if (status === "stale") return "offline";
  if (status === "online" && (installationStatus !== "active" || expiresAt === undefined || expiresAt <= now)) return "offline";
  return status;
}

function assertControlAdapterCompatibility(control: MtmControlAdapterDescriptor, local: AdapterDescriptor): void {
  if (control.adapterId !== local.id || control.version !== local.version) throw new Error("control projection adapter descriptor mismatch");
  if (control.capabilities.length !== local.capabilities.length) throw new Error("control projection adapter capabilities do not match");
  for (const capability of local.capabilities) {
    const remote = control.capabilities.find((candidate) => candidate.capabilityId === capability.id);
    if (remote === undefined || remote.version !== capability.version || remote.role !== capability.role || remote.operations.length !== capability.operations.length) throw new Error("control projection capability descriptor mismatch");
    for (const operation of capability.operations) {
      const remoteOperation = remote.operations.find((candidate) => candidate.operationId === operation.id);
      if (remoteOperation === undefined || remoteOperation.sideEffect !== operation.sideEffect || remoteOperation.requiresApproval !== operation.requiresApproval) throw new Error("control projection operation descriptor mismatch");
    }
  }
}

function recordedDedupeKeys(history: readonly EventRecord[]): string[] {
  return history.map((record) => record.event.dedupeKey);
}

export function createDemoRegistry(now?: () => number, scope?: MtmControlScope): MtmConnectRegistry {
  return new MtmConnectRegistry({ ownerId: "demo-user", now, seed: true, scope });
}
