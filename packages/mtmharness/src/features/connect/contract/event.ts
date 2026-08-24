import { isJsonValue, isRecord, jsonByteLength, type JsonObject, type JsonValue } from "./json.ts";

export const EVENT_POLICIES = ["observe", "inject-next", "wake-agent", "require-approval", "disabled"] as const;
export type EventPolicy = (typeof EVENT_POLICIES)[number];
export type EventDisposition = "observed" | "queued" | "wake-agent" | "approval-required" | "dropped";

export interface ExternalConnectionEvent {
  readonly eventId: string;
  readonly connectionId: string;
  readonly capabilityId: string;
  readonly generation: number;
  readonly occurredAt: number;
  readonly kind: string;
  readonly payload: JsonObject;
  readonly dedupeKey: string;
  readonly source: string;
}

export interface EventProjection {
  readonly eventId: string;
  readonly dedupeKey: string;
  readonly policy: EventPolicy;
  readonly disposition: EventDisposition;
  readonly reason?: string;
}

export interface EventRecord {
  readonly event: ExternalConnectionEvent;
  readonly projection: EventProjection;
  readonly recordedAt: number;
}

const MAX_EVENT_BYTES = 8_192;
const ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

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

function integerValue(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(label + " must be a non-negative integer");
  return value as number;
}

export function validateExternalEvent(value: unknown): ExternalConnectionEvent {
  if (!isRecord(value)) throw new Error("external event must be an object");
  exactKeys(value, ["eventId", "connectionId", "capabilityId", "generation", "occurredAt", "kind", "payload", "dedupeKey", "source"], "external event");
  if (!isRecord(value.payload)) throw new Error("external event payload must be an object");
  if (!Object.values(value.payload).every(isJsonValue)) throw new Error("external event payload must be JSON-safe");
  const event: ExternalConnectionEvent = {
    eventId: stringValue(value.eventId, "eventId"),
    connectionId: stringValue(value.connectionId, "connectionId"),
    capabilityId: stringValue(value.capabilityId, "capabilityId"),
    generation: integerValue(value.generation, "generation"),
    occurredAt: integerValue(value.occurredAt, "occurredAt"),
    kind: stringValue(value.kind, "event kind"),
    payload: value.payload as JsonObject,
    dedupeKey: stringValue(value.dedupeKey, "dedupeKey"),
    source: stringValue(value.source, "event source"),
  };
  if (jsonByteLength(event as unknown as JsonValue) > MAX_EVENT_BYTES) throw new Error("external event exceeds the 8 KiB payload limit");
  return event;
}

function dropped(event: ExternalConnectionEvent, policy: EventPolicy, reason: string): EventProjection {
  return { eventId: event.eventId, dedupeKey: event.dedupeKey, policy, disposition: "dropped", reason };
}

export function projectExternalEvent(
  event: ExternalConnectionEvent,
  policy: EventPolicy,
  seenDedupeKeys: ReadonlySet<string>,
): EventProjection {
  if (seenDedupeKeys.has(event.dedupeKey)) return dropped(event, policy, "duplicate-dedupe-key");
  if (policy === "disabled") return dropped(event, policy, "policy-disabled");
  if (policy === "observe") return { eventId: event.eventId, dedupeKey: event.dedupeKey, policy, disposition: "observed" };
  if (policy === "inject-next") return { eventId: event.eventId, dedupeKey: event.dedupeKey, policy, disposition: "queued" };
  if (policy === "wake-agent") return { eventId: event.eventId, dedupeKey: event.dedupeKey, policy, disposition: "wake-agent" };
  return { eventId: event.eventId, dedupeKey: event.dedupeKey, policy, disposition: "approval-required" };
}
