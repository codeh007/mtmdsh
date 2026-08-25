import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-runtime/client";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import type { EventProjection, EventPolicy, ExternalConnectionEvent } from "../contract/event.ts";
import type { CapabilityInvocationResult, MtmConnectInvocationRequest, MtmConnectMutation, MtmConnectSnapshot } from "../contract/connection.ts";
import type { MtmControlSnapshot } from "../contract/control-plane.ts";
import { MTM_CONNECT_CHANNEL, assertMtmConnectInvocationResult, assertMtmConnectMutationResponse, assertMtmConnectSnapshot, type MtmConnectMutationResponse, type MtmConnectRpcRequest } from "../contract/rpc.ts";
import type { JsonObject } from "../contract/json.ts";
import { validateSnapshot } from "../contract/snapshot.ts";
import { MtmConnectRegistry } from "../core/registry.ts";

export interface MtmConnectTransport {
  snapshot(signal?: AbortSignal): Promise<MtmConnectSnapshot>;
  mutate(mutation: MtmConnectMutation, signal?: AbortSignal): Promise<MtmConnectMutationResponse>;
  reconcile(snapshot: MtmControlSnapshot, signal?: AbortSignal): Promise<MtmConnectMutationResponse>;
  invoke(request: MtmConnectInvocationRequest, signal?: AbortSignal): Promise<CapabilityInvocationResult>;
}

export function createMtmConnectTransport(rpc: ClientConnectionRpc): MtmConnectTransport {
  async function call(request: MtmConnectRpcRequest, signal?: AbortSignal): Promise<unknown> {
    const result = await rpc.call(MTM_CONNECT_CHANNEL, "request", { args: request }, signal);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  }
  return {
    async snapshot(signal) {
      const value = await call({ kind: "snapshot" }, signal);
      assertMtmConnectSnapshot(value);
      return validateSnapshot(value);
    },
    async mutate(mutation, signal) {
      const value = await call({ kind: "mutate", mutation }, signal);
      assertMtmConnectMutationResponse(value);
      return { snapshot: validateSnapshot(value.snapshot), ...(value.projection === undefined ? {} : { projection: value.projection }) };
    },
    async reconcile(snapshot, signal) {
      const value = await call({ kind: "reconcile", snapshot }, signal);
      assertMtmConnectMutationResponse(value);
      return { snapshot: validateSnapshot(value.snapshot), ...(value.projection === undefined ? {} : { projection: value.projection }) };
    },
    async invoke(request, signal) {
      const value = await call({ kind: "invoke", request }, signal);
      assertMtmConnectInvocationResult(value);
      return value;
    },
  };
}

export interface MtmConnectViewState {
  readonly snapshot: MtmConnectSnapshot;
  readonly selectedConnectionId?: string;
  readonly lastProjection?: EventProjection;
  readonly lastInvocation?: CapabilityInvocationResult;
  readonly notice?: string;
  readonly loading: boolean;
}

export interface MtmConnectClientActions {
  selectConnection(connectionId: string): void;
  refresh(): void;
  createMockConnection(): void;
  enableSelected(): void;
  disableSelected(): void;
  revokeSelected(): void;
  reconnectSelected(): void;
  setCapabilityEnabled(capabilityId: string, enabled: boolean): void;
  setModelInvocable(capabilityId: string, enabled: boolean): void;
  setUserInvocable(capabilityId: string, enabled: boolean): void;
  setEventPolicy(capabilityId: string, policy: EventPolicy): void;
  simulateEvent(): void;
  invokeFirstCapability(): void;
  approveFirstCapability(): void;
}

export interface MtmConnectClientRuntimeOptions {
  readonly snapshot?: MtmConnectSnapshot;
  readonly now?: () => number;
  readonly fixture?: boolean;
  readonly transport?: MtmConnectTransport;
}

export class MtmConnectClientRuntime implements ObservableSnapshot<MtmConnectViewState>, MtmConnectClientActions {
  private readonly registry: MtmConnectRegistry | undefined;
  private readonly transport: MtmConnectTransport | undefined;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeRegistry: () => void;
  private readonly abortController = new AbortController();
  private readonly now: () => number;
  private mutationTail = Promise.resolve();
  private sequence = 1;
  private disposed = false;
  private view: MtmConnectViewState;

  constructor(options: MtmConnectClientRuntimeOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.transport = options.transport;
    if (this.transport === undefined && options.fixture !== true) {
      throw new Error("mtm-connect: Host transport is required");
    }
    if (this.transport === undefined) {
      const ownerId = options.snapshot?.ownerId ?? "demo-user";
      this.registry = new MtmConnectRegistry(options.snapshot === undefined
        ? { ownerId, seed: options.fixture !== false, now: this.now }
        : { ownerId, snapshot: options.snapshot, now: this.now });
      const snapshot = this.registry.getSnapshot();
      this.view = { snapshot, selectedConnectionId: snapshot.connections[0]?.instance.id, loading: false };
      this.unsubscribeRegistry = this.registry.subscribe(() => { this.adoptSnapshot(this.registry?.getSnapshot()); });
    } else {
      this.registry = undefined;
      const initialSnapshot = options.snapshot === undefined
        ? { schemaVersion: 2 as const, revision: 0, ownerId: "pending", adapters: [], connections: [], activeModelProfile: null, eventHistory: [], updatedAt: 0 }
        : validateSnapshot(options.snapshot);
      this.view = { snapshot: initialSnapshot, loading: true };
      this.unsubscribeRegistry = () => {};
      void this.loadSnapshot();
    }
  }

  getSnapshot = (): MtmConnectViewState => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  selectConnection(connectionId: string): void {
    if (!this.view.snapshot.connections.some((record) => record.instance.id === connectionId)) return;
    this.setView({ selectedConnectionId: connectionId, notice: undefined });
  }

  refresh(): void {
    if (this.transport === undefined) return;
    void this.loadSnapshot();
  }

  createMockConnection(): void {
    this.mutate({ type: "create", adapterId: "mock-world", label: "New workstation (fixture)", config: { root: "/workspace/demo-new", transport: "in-memory" } });
  }

  enableSelected(): void {
    this.withSelected((connectionId) => { this.mutate({ type: "enable", connectionId }); });
  }

  disableSelected(): void {
    this.withSelected((connectionId) => { this.mutate({ type: "disable", connectionId }); });
  }

  revokeSelected(): void {
    this.withSelected((connectionId) => { this.mutate({ type: "revoke", connectionId }); });
  }

  reconnectSelected(): void {
    this.withSelected((connectionId) => { this.mutate({ type: "reconnect", connectionId }); });
  }

  setCapabilityEnabled(capabilityId: string, enabled: boolean): void {
    this.setPolicy(capabilityId, { enabled });
  }

  setModelInvocable(capabilityId: string, enabled: boolean): void {
    this.setPolicy(capabilityId, { modelInvocable: enabled });
  }

  setUserInvocable(capabilityId: string, enabled: boolean): void {
    this.setPolicy(capabilityId, { userInvocable: enabled });
  }

  setEventPolicy(capabilityId: string, policy: EventPolicy): void {
    this.setPolicy(capabilityId, { eventPolicy: policy });
  }

  simulateEvent(): void {
    const selected = this.requireSelected();
    if (selected.observation.status !== "online") {
      this.setView({ notice: "Enable the connection before emitting an event" });
      return;
    }
    const capabilityId = Object.keys(selected.instance.bindings)[0];
    if (capabilityId === undefined) {
      this.setView({ notice: "Selected connection has no capability" });
      return;
    }
    const event: ExternalConnectionEvent = {
      eventId: "fixture-event-" + this.sequence,
      connectionId: selected.instance.id,
      capabilityId,
      generation: selected.observation.generation,
      occurredAt: this.now(),
      kind: capabilityId === "device.control" ? "device.notification" : "workspace.changed",
      payload: capabilityId === "device.control"
        ? { title: "Build finished", body: "Fixture device received a notification" }
        : { path: "/workspace/demo/src/index.ts", change: "modified" },
      dedupeKey: "fixture-event-key-" + this.sequence,
      source: "mock-adapter",
    };
    this.sequence += 1;
    this.mutate({ type: "event", connectionId: selected.instance.id, event });
  }

  invokeFirstCapability(): void {
    this.invokeFirst(false);
  }

  approveFirstCapability(): void {
    this.invokeFirst(true);
  }

  restoreSnapshot(snapshot: MtmConnectSnapshot): void {
    if (this.registry === undefined) {
      this.setView({ notice: "Remote snapshots are owned by the Host" });
      return;
    }
    try {
      this.registry.restoreSnapshot(snapshot);
    } catch (error) {
      this.setView({ notice: error instanceof Error ? error.message : String(error) });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort();
    this.unsubscribeRegistry();
    this.registry?.dispose();
    this.listeners.clear();
  }

  private async loadSnapshot(): Promise<void> {
    if (this.transport === undefined || this.disposed) return;
    try {
      const snapshot = await this.transport.snapshot(this.abortController.signal);
      this.adoptSnapshot(snapshot, { loading: false, notice: undefined });
    } catch (error) {
      if (!this.disposed) this.setView({ loading: false, notice: error instanceof Error ? error.message : String(error) });
    }
  }

  private setPolicy(capabilityId: string, patch: Parameters<MtmConnectRegistry["setCapabilityPolicy"]>[2]): void {
    this.withSelected((connectionId) => { this.mutate({ type: "set-policy", connectionId, capabilityId, patch }); });
  }

  private invokeFirst(approved: boolean): void {
    let selected: ReturnType<MtmConnectClientRuntime["requireSelected"]>;
    try {
      selected = this.requireSelected();
    } catch (error) {
      this.setView({ notice: error instanceof Error ? error.message : String(error) });
      return;
    }
    const capabilityId = Object.keys(selected.instance.bindings)[0];
    if (capabilityId === undefined) {
      this.setView({ notice: "Selected connection has no capability" });
      return;
    }
    const adapter = this.view.snapshot.adapters.find((candidate) => candidate.id === selected.instance.adapterId);
    const capability = adapter?.capabilities.find((candidate) => candidate.id === capabilityId);
    const operation = capability?.operations[0];
    if (capability === undefined || operation === undefined) {
      this.setView({ notice: "Selected connection has no operation" });
      return;
    }
    const input: JsonObject = operation.id === "input.tap" ? { x: 420, y: 880 } : { path: selected.instance.config.root ?? "/workspace/demo" };
    const request: MtmConnectInvocationRequest = {
      connectionId: selected.instance.id,
      generation: selected.observation.generation,
      capabilityId,
      operationId: operation.id,
      input,
      actor: "user",
      approved,
    };
    if (this.transport === undefined) {
      const registry = this.registry;
      if (registry === undefined) return;
      void registry.invoke(request)
        .then((result) => { this.setView({ lastInvocation: result, notice: result.ok ? result.summary : result.message }); })
        .catch((error) => { this.setView({ notice: error instanceof Error ? error.message : String(error) }); });
      return;
    }
    void this.enqueue(async () => {
      try {
        const result = await this.transport!.invoke(request, this.abortController.signal);
        this.setView({ lastInvocation: result, notice: result.ok ? result.summary : result.message });
      } catch (error) {
        this.setView({ notice: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  private mutate(mutation: MtmConnectMutation): void {
    if (this.transport === undefined) {
      try {
        const response = this.registry!.applyMutation(mutation);
        const selected = mutation.type === "create" ? response.snapshot.connections.at(-1)?.instance.id : undefined;
        this.adoptSnapshot(response.snapshot, {
          ...(selected === undefined ? {} : { selectedConnectionId: selected }),
          ...(response.projection === undefined ? {} : { lastProjection: response.projection, notice: projectionMessage(response.projection) }),
        });
      } catch (error) {
        this.setView({ notice: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    void this.enqueue(async () => {
      try {
        const response = await this.transport!.mutate(mutation, this.abortController.signal);
        const selected = mutation.type === "create" ? response.snapshot.connections.at(-1)?.instance.id : undefined;
        this.adoptSnapshot(response.snapshot, {
          ...(selected === undefined ? {} : { selectedConnectionId: selected }),
          ...(response.projection === undefined ? {} : { lastProjection: response.projection, notice: projectionMessage(response.projection) }),
        });
      } catch (error) {
        this.setView({ notice: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.mutationTail.then(task, task);
    this.mutationTail = next.then(() => undefined, () => undefined);
    return next;
  }

  private withSelected(action: (connectionId: string) => void): void {
    try {
      action(this.selectedId());
    } catch (error) {
      this.setView({ notice: error instanceof Error ? error.message : String(error) });
    }
  }

  private selectedId(): string {
    const id = this.view.selectedConnectionId ?? this.view.snapshot.connections[0]?.instance.id;
    if (id === undefined) throw new Error("Create a connection before using the control panel");
    return id;
  }

  private requireSelected() {
    const id = this.selectedId();
    const record = this.view.snapshot.connections.find((candidate) => candidate.instance.id === id);
    if (record === undefined) throw new Error("Selected connection is no longer available");
    return record;
  }

  private adoptSnapshot(snapshotInput: MtmConnectSnapshot | undefined, patch: Partial<MtmConnectViewState> = {}): void {
    if (snapshotInput === undefined || this.disposed) return;
    const snapshot = validateSnapshot(snapshotInput);
    if (snapshot.revision < this.view.snapshot.revision) return;
    const selected = patch.selectedConnectionId !== undefined
      ? patch.selectedConnectionId
      : this.view.selectedConnectionId !== undefined && snapshot.connections.some((record) => record.instance.id === this.view.selectedConnectionId)
        ? this.view.selectedConnectionId
        : snapshot.connections[0]?.instance.id;
    this.setView({ ...patch, snapshot, selectedConnectionId: selected });
  }

  private setView(patch: Partial<MtmConnectViewState>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}

function projectionMessage(projection: EventProjection): string {
  if (projection.disposition === "dropped") return "Event dropped: " + (projection.reason ?? "policy");
  if (projection.disposition === "observed") return "Event observed without a model turn";
  if (projection.disposition === "queued") return "Event queued for the next admitted step";
  if (projection.disposition === "wake-agent") return "Event would wake the agent under this policy";
  return "Event is waiting for user approval";
}
