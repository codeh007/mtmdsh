import type { CapabilityBinding, BindingScope, MtmConnectMutation, MtmConnectSnapshot, MtmConnectInvocationRequest } from "./connection.ts";
import { EVENT_POLICIES, validateExternalEvent, type EventPolicy, type ExternalConnectionEvent } from "./event.ts";
import { isJsonValue, isRecord, type JsonObject } from "./json.ts";
import type { CapabilityInvocationResult } from "./connection.ts";
import { validateMtmControlSnapshot, type MtmControlSnapshot } from "./control-plane.ts";

export const MTM_CONNECT_CHANNEL = "/mtm-connect";

export type MtmConnectRpcRequest =
  | { readonly kind: "snapshot" }
  | { readonly kind: "mutate"; readonly mutation: MtmConnectMutation }
  | { readonly kind: "invoke"; readonly request: MtmConnectInvocationRequest }
  | { readonly kind: "reconcile"; readonly snapshot: MtmControlSnapshot };

export interface MtmConnectMutationResponse {
  readonly snapshot: MtmConnectSnapshot;
  readonly projection?: import("./event.ts").EventProjection;
}

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const PROJECTION_DISPOSITIONS = ["observed", "queued", "wake-agent", "approval-required", "dropped"] as const;

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(label + " contains unsupported field: " + key);
  }
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) throw new Error(label + " must be a bounded identifier");
  return value;
}

function labelValue(value: unknown): string {
  if (typeof value !== "string" || value.trim().length < 2 || value.trim().length > 80) throw new Error("connection label is invalid");
  return value.trim();
}

function objectValue(value: unknown, label: string): JsonObject {
  if (!isRecord(value) || !Object.values(value).every(isJsonValue)) throw new Error(label + " must be a JSON object");
  return value as JsonObject;
}

function scopeValue(value: unknown): BindingScope {
  if (value !== "profile" && value !== "sandbox" && value !== "session") throw new Error("connection scope is invalid");
  return value;
}

function policyValue(value: unknown): EventPolicy {
  if (!EVENT_POLICIES.includes(value as EventPolicy)) throw new Error("event policy is invalid");
  return value as EventPolicy;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(label + " must be a boolean");
  return value;
}

function integerValue(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(label + " must be a non-negative safe integer");
  return value as number;
}

function parsePolicyPatch(value: unknown): Partial<Pick<CapabilityBinding, "enabled" | "modelInvocable" | "userInvocable" | "eventPolicy">> {
  if (!isRecord(value)) throw new Error("capability policy patch must be an object");
  exactKeys(value, ["enabled", "modelInvocable", "userInvocable", "eventPolicy"], "capability policy patch");
  if (Object.keys(value).length === 0) throw new Error("capability policy patch cannot be empty");
  return {
    ...(value.enabled === undefined ? {} : { enabled: booleanValue(value.enabled, "enabled") }),
    ...(value.modelInvocable === undefined ? {} : { modelInvocable: booleanValue(value.modelInvocable, "modelInvocable") }),
    ...(value.userInvocable === undefined ? {} : { userInvocable: booleanValue(value.userInvocable, "userInvocable") }),
    ...(value.eventPolicy === undefined ? {} : { eventPolicy: policyValue(value.eventPolicy) }),
  };
}

function parseMutation(value: unknown): MtmConnectMutation {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error("mtm-connect mutation must be an object with a type");
  switch (value.type) {
    case "create":
      exactKeys(value, ["type", "adapterId", "label", "config", "scope"], "create mutation");
      return {
        type: "create",
        adapterId: stringValue(value.adapterId, "adapterId"),
        label: labelValue(value.label),
        config: objectValue(value.config, "config"),
        ...(value.scope === undefined ? {} : { scope: scopeValue(value.scope) }),
      };
    case "enable":
      exactKeys(value, ["type", "connectionId"], "enable mutation");
      return { type: "enable", connectionId: stringValue(value.connectionId, "connectionId") };
    case "disable":
      exactKeys(value, ["type", "connectionId"], "disable mutation");
      return { type: "disable", connectionId: stringValue(value.connectionId, "connectionId") };
    case "revoke":
      exactKeys(value, ["type", "connectionId"], "revoke mutation");
      return { type: "revoke", connectionId: stringValue(value.connectionId, "connectionId") };
    case "reconnect":
      exactKeys(value, ["type", "connectionId"], "reconnect mutation");
      return { type: "reconnect", connectionId: stringValue(value.connectionId, "connectionId") };
    case "set-policy":
      exactKeys(value, ["type", "connectionId", "capabilityId", "patch"], "policy mutation");
      return {
        type: "set-policy",
        connectionId: stringValue(value.connectionId, "connectionId"),
        capabilityId: stringValue(value.capabilityId, "capabilityId"),
        patch: parsePolicyPatch(value.patch),
      };
    case "event":
      exactKeys(value, ["type", "connectionId", "event"], "event mutation");
      if (!isRecord(value.event)) throw new Error("event mutation event is required");
      return {
        type: "event",
        connectionId: stringValue(value.connectionId, "connectionId"),
        event: validateExternalEvent(value.event),
      };
    default:
      throw new Error("unsupported mtm-connect mutation");
  }
}

function parseInvocation(value: unknown): MtmConnectInvocationRequest {
  if (!isRecord(value)) throw new Error("invocation request must be an object");
  exactKeys(value, ["connectionId", "generation", "capabilityId", "operationId", "input", "actor", "approved"], "invocation request");
  if (value.actor !== "user" && value.actor !== "model") throw new Error("invocation actor is invalid");
  return {
    connectionId: stringValue(value.connectionId, "connectionId"),
    generation: integerValue(value.generation, "generation"),
    capabilityId: stringValue(value.capabilityId, "capabilityId"),
    operationId: stringValue(value.operationId, "operationId"),
    input: objectValue(value.input, "input"),
    actor: value.actor,
    ...(value.approved === undefined ? {} : { approved: booleanValue(value.approved, "approved") }),
  };
}

export function parseMtmConnectRpcRequest(value: unknown): MtmConnectRpcRequest {
  if (!isRecord(value) || typeof value.kind !== "string") throw new Error("mtm-connect RPC request is invalid");
  switch (value.kind) {
    case "snapshot":
      exactKeys(value, ["kind"], "snapshot request");
      return { kind: "snapshot" };
    case "mutate":
      exactKeys(value, ["kind", "mutation"], "mutation request");
      return { kind: "mutate", mutation: parseMutation(value.mutation) };
    case "invoke":
      exactKeys(value, ["kind", "request"], "invoke request");
      return { kind: "invoke", request: parseInvocation(value.request) };
    case "reconcile":
      exactKeys(value, ["kind", "snapshot"], "reconcile request");
      validateMtmControlSnapshot(value.snapshot);
      return { kind: "reconcile", snapshot: value.snapshot };
    default:
      throw new Error("unsupported mtm-connect RPC request");
  }
}

export function assertMtmConnectSnapshot(value: unknown): asserts value is MtmConnectSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error("mtm-connect RPC returned an invalid snapshot");
}

export function assertMtmConnectMutationResponse(value: unknown): asserts value is MtmConnectMutationResponse {
  if (!isRecord(value) || !isRecord(value.snapshot)) throw new Error("mtm-connect RPC returned an invalid mutation response");
  if (value.projection !== undefined) {
    if (!isRecord(value.projection)
      || typeof value.projection.eventId !== "string"
      || typeof value.projection.dedupeKey !== "string"
      || !EVENT_POLICIES.includes(value.projection.policy as EventPolicy)
      || !PROJECTION_DISPOSITIONS.includes(value.projection.disposition as (typeof PROJECTION_DISPOSITIONS)[number])) {

      throw new Error("mtm-connect RPC returned an invalid event projection");
    }
  }
}

export function assertMtmConnectInvocationResult(value: unknown): asserts value is CapabilityInvocationResult {
  if (!isRecord(value) || typeof value.ok !== "boolean") throw new Error("mtm-connect RPC returned an invalid invocation result");
  if (value.ok) {
    if (typeof value.simulated !== "boolean" || typeof value.adapterId !== "string" || typeof value.connectionId !== "string"
      || !Number.isSafeInteger(value.generation) || typeof value.capabilityId !== "string" || typeof value.operationId !== "string"
      || typeof value.summary !== "string" || !isRecord(value.data) || !Object.values(value.data).every(isJsonValue)) {
      throw new Error("mtm-connect RPC returned an invalid successful invocation");
    }
    return;
  }
  const codes = ["connection-not-found", "connection-offline", "stale-generation", "capability-not-found", "capability-disabled", "policy-denied", "approval-required", "input-too-large", "output-too-large", "adapter-unavailable", "unsupported-operation", "invalid-input"] as const;
  if (!codes.includes(value.code as (typeof codes)[number]) || typeof value.message !== "string") throw new Error("mtm-connect RPC returned an invalid invocation failure");
}

// Keep these imports in the shared module's type surface without making the wire parser depend on runtime services.
export type { MtmConnectMutation, MtmConnectSnapshot, MtmConnectInvocationRequest, ExternalConnectionEvent };
