import type { AdapterDescriptor, CapabilityDescriptor } from "./adapter.ts";
import type { EventPolicy, EventRecord, EventProjection, ExternalConnectionEvent } from "./event.ts";
import { assertPublicConfig, type JsonObject } from "./json.ts";

export type DesiredConnectionState = "disabled" | "enabled";
export type ObservedConnectionState = "configured" | "authorizing" | "enrolled" | "connecting" | "online" | "degraded" | "offline" | "revoked";
export type BindingScope = "profile" | "sandbox" | "session";

export interface CapabilityBinding {
  readonly capabilityId: string;
  readonly enabled: boolean;
  readonly modelInvocable: boolean;
  readonly userInvocable: boolean;
  readonly eventPolicy: EventPolicy;
}

export interface WorldBinding {
  readonly capabilityId: string;
  readonly scope: BindingScope;
  readonly status: "selected" | "not-selected";
}

export interface ConnectionInstance {
  readonly id: string;
  readonly ownerId: string;
  readonly adapterId: string;
  readonly label: string;
  readonly config: JsonObject;
  readonly desired: DesiredConnectionState;
  readonly bindings: Readonly<Record<string, CapabilityBinding>>;
  readonly worldBinding?: WorldBinding;
  readonly fixture: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ConnectionObservation {
  readonly status: ObservedConnectionState;
  readonly generation: number;
  readonly channelId?: string;
  readonly lastSeenAt?: number;
  readonly expiresAt?: number;
  readonly lastError?: { readonly code: string; readonly message: string };
}

export interface ConnectionRecord {
  readonly instance: ConnectionInstance;
  readonly observation: ConnectionObservation;
}

export interface MtmConnectSnapshot {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly controlRevision?: number;
  readonly ownerId: string;
  readonly adapters: readonly AdapterDescriptor[];
  readonly connections: readonly ConnectionRecord[];
  readonly eventHistory: readonly EventRecord[];
  readonly updatedAt: number;
}

export type CapabilityInvocationResult =
  | {
    readonly ok: true;
    readonly simulated: true;
    readonly adapterId: string;
    readonly connectionId: string;
    readonly generation: number;
    readonly capabilityId: string;
    readonly operationId: string;
    readonly summary: string;
    readonly data: JsonObject;
  }
  | {
    readonly ok: false;
    readonly code: "connection-not-found" | "connection-offline" | "stale-generation" | "capability-not-found" | "capability-disabled" | "policy-denied" | "approval-required" | "input-too-large" | "output-too-large" | "adapter-unavailable" | "unsupported-operation" | "invalid-input";
    readonly message: string;
  };

export type MtmConnectMutation =
  | { readonly type: "create"; readonly adapterId: string; readonly label: string; readonly config: JsonObject; readonly scope?: BindingScope }
  | { readonly type: "enable"; readonly connectionId: string }
  | { readonly type: "disable"; readonly connectionId: string }
  | { readonly type: "revoke"; readonly connectionId: string }
  | { readonly type: "reconnect"; readonly connectionId: string }
  | { readonly type: "set-policy"; readonly connectionId: string; readonly capabilityId: string; readonly patch: Partial<Pick<CapabilityBinding, "enabled" | "modelInvocable" | "userInvocable" | "eventPolicy">> }
  | { readonly type: "event"; readonly connectionId: string; readonly event: ExternalConnectionEvent };

export interface MtmConnectInvocationRequest {
  readonly connectionId: string;
  readonly generation: number;
  readonly capabilityId: string;
  readonly operationId: string;
  readonly input: JsonObject;
  readonly actor: "model" | "user";
  readonly approved?: boolean;
}

export interface ConnectionSeed {
  readonly id: string;
  readonly label: string;
  readonly config: JsonObject;
  readonly fixture?: boolean;
  readonly scope?: BindingScope;
}

export function defaultBindings(adapter: AdapterDescriptor): Readonly<Record<string, CapabilityBinding>> {
  const bindings: Record<string, CapabilityBinding> = {};
  for (const capability of adapter.capabilities) {
    bindings[capability.id] = {
      capabilityId: capability.id,
      enabled: true,
      modelInvocable: capability.role === "primary-world" ? false : true,
      userInvocable: true,
      eventPolicy: "observe",
    };
  }
  return bindings;
}

export function emptySnapshot(ownerId = "unknown"): MtmConnectSnapshot {
  return { schemaVersion: 1, revision: 0, ownerId, adapters: [], connections: [], eventHistory: [], updatedAt: 0 };
}

export function createConnectionRecord(
  ownerId: string,
  adapter: AdapterDescriptor,
  seed: ConnectionSeed,
  now: number,
): ConnectionRecord {
  assertPublicConfig(seed.config);
  const primary = adapter.capabilities.find((capability) => capability.role === "primary-world");
  return {
    instance: {
      id: seed.id,
      ownerId,
      adapterId: adapter.id,
      label: seed.label,
      config: seed.config,
      desired: "disabled",
      bindings: defaultBindings(adapter),
      ...(primary === undefined ? {} : {
        worldBinding: { capabilityId: primary.id, scope: seed.scope ?? "sandbox", status: "selected" },
      }),
      fixture: seed.fixture ?? true,
      createdAt: now,
      updatedAt: now,
    },
    observation: { status: "configured", generation: 0 },
  };
}

export function adapterCapability(adapter: AdapterDescriptor, capabilityId: string): CapabilityDescriptor | undefined {
  return adapter.capabilities.find((capability) => capability.id === capabilityId);
}
