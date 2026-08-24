import { isJsonValue, isRecord } from "./json.ts";

export type AdapterStatus = "installed" | "unavailable";
export type AdapterKind = "mock-world" | "mock-device" | "unavailable";
export type CapabilityRole = "primary-world" | "additive-capability";
export type OperationKind = "one-shot" | "declarative";
export type OperationSideEffect = "read" | "write";
export type SetupMethodKind = "mock" | "manual" | "device-code" | "oauth";

export interface SetupMethodDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: SetupMethodKind;
  readonly status: "available" | "unavailable";
}

export interface OperationDescriptor {
  readonly id: string;
  readonly label: string;
  readonly kind: OperationKind;
  readonly sideEffect: OperationSideEffect;
  readonly requiresApproval: boolean;
}

export interface CapabilityLimits {
  readonly maxInputBytes: number;
  readonly maxOutputBytes: number;
}

export interface CapabilityDescriptor {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly role: CapabilityRole;
  readonly eventKinds: readonly string[];
  readonly operations: readonly OperationDescriptor[];
  readonly limits: CapabilityLimits;
  readonly supportedTargets: readonly string[];
}

export interface AdapterDescriptor {
  readonly id: string;
  readonly version: string;
  readonly label: string;
  readonly summary: string;
  readonly status: AdapterStatus;
  readonly kind: AdapterKind;
  readonly setupMethods: readonly SetupMethodDescriptor[];
  readonly capabilities: readonly CapabilityDescriptor[];
  readonly availabilityNote?: string;
}

const ID_PATTERN = /^[a-z][a-z0-9.-]{1,63}$/;

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(label + " contains unsupported field: " + key);
  }
}

function stringValue(value: unknown, label: string, pattern = /.+/): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(label + " must be a non-empty string");
  return value;
}

function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(label + " must be a boolean");
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(label + " must be a positive integer");
  return value as number;
}

function stringList(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(label + " must be an array");
  return value.map((item, index) => stringValue(item, label + "[" + index + "]"));
}

function validateSetupMethod(value: unknown, index: number): SetupMethodDescriptor {
  if (!isRecord(value)) throw new Error("setupMethods[" + index + "] must be an object");
  exactKeys(value, ["id", "label", "kind", "status"], "setupMethods[" + index + "]");
  const kind = value.kind;
  if (kind !== "mock" && kind !== "manual" && kind !== "device-code" && kind !== "oauth") throw new Error("invalid setup method kind");
  const status = value.status;
  if (status !== "available" && status !== "unavailable") throw new Error("invalid setup method status");
  return {
    id: stringValue(value.id, "setup method id", ID_PATTERN),
    label: stringValue(value.label, "setup method label"),
    kind,
    status,
  };
}

function validateOperation(value: unknown, index: number): OperationDescriptor {
  if (!isRecord(value)) throw new Error("operation[" + index + "] must be an object");
  exactKeys(value, ["id", "label", "kind", "sideEffect", "requiresApproval"], "operation[" + index + "]");
  const kind = value.kind;
  if (kind !== "one-shot" && kind !== "declarative") throw new Error("invalid operation kind");
  const sideEffect = value.sideEffect;
  if (sideEffect !== "read" && sideEffect !== "write") throw new Error("invalid operation side effect");
  const requiresApproval = booleanValue(value.requiresApproval, "operation requiresApproval");
  if (sideEffect === "write" && !requiresApproval) throw new Error("write operations must require approval");
  return {
    id: stringValue(value.id, "operation id", ID_PATTERN),
    label: stringValue(value.label, "operation label"),
    kind,
    sideEffect,
    requiresApproval,
  };
}

function validateCapability(value: unknown, index: number): CapabilityDescriptor {
  if (!isRecord(value)) throw new Error("capability[" + index + "] must be an object");
  exactKeys(value, ["id", "version", "label", "role", "eventKinds", "operations", "limits", "supportedTargets"], "capability[" + index + "]");
  const role = value.role;
  if (role !== "primary-world" && role !== "additive-capability") throw new Error("invalid capability role");
  if (!Array.isArray(value.operations)) throw new Error("capability operations must be an array");
  if (!isRecord(value.limits)) throw new Error("capability limits must be an object");
  exactKeys(value.limits, ["maxInputBytes", "maxOutputBytes"], "capability limits");
  return {
    id: stringValue(value.id, "capability id", ID_PATTERN),
    version: stringValue(value.version, "capability version"),
    label: stringValue(value.label, "capability label"),
    role,
    eventKinds: stringList(value.eventKinds, "capability eventKinds"),
    operations: value.operations.map(validateOperation),
    limits: {
      maxInputBytes: positiveInteger(value.limits.maxInputBytes, "capability maxInputBytes"),
      maxOutputBytes: positiveInteger(value.limits.maxOutputBytes, "capability maxOutputBytes"),
    },
    supportedTargets: stringList(value.supportedTargets, "capability supportedTargets"),
  };
}

export function validateAdapterDescriptor(value: unknown): AdapterDescriptor {
  if (!isRecord(value)) throw new Error("adapter descriptor must be an object");
  exactKeys(value, ["id", "version", "label", "summary", "status", "kind", "setupMethods", "capabilities", "availabilityNote"], "adapter descriptor");
  const status = value.status;
  if (status !== "installed" && status !== "unavailable") throw new Error("invalid adapter status");
  const kind = value.kind;
  if (kind !== "mock-world" && kind !== "mock-device" && kind !== "unavailable") throw new Error("invalid adapter kind");
  if (!Array.isArray(value.setupMethods) || !Array.isArray(value.capabilities)) throw new Error("adapter setupMethods and capabilities must be arrays");
  if (value.availabilityNote !== undefined) stringValue(value.availabilityNote, "adapter availabilityNote");
  const setupMethods = value.setupMethods.map(validateSetupMethod);
  const capabilities = value.capabilities.map(validateCapability);
  const setupIds = new Set<string>();
  for (const setup of setupMethods) {
    if (setupIds.has(setup.id)) throw new Error("duplicate setup method id: " + setup.id);
    setupIds.add(setup.id);
  }
  const capabilityIds = new Set<string>();
  for (const capability of capabilities) {
    if (capabilityIds.has(capability.id)) throw new Error("duplicate capability id: " + capability.id);
    capabilityIds.add(capability.id);
    const operationIds = new Set<string>();
    for (const operation of capability.operations) {
      if (operationIds.has(operation.id)) throw new Error("duplicate operation id: " + operation.id);
      operationIds.add(operation.id);
    }
  }
  const descriptor: AdapterDescriptor = {
    id: stringValue(value.id, "adapter id", ID_PATTERN),
    version: stringValue(value.version, "adapter version"),
    label: stringValue(value.label, "adapter label"),
    summary: stringValue(value.summary, "adapter summary"),
    status,
    kind,
    setupMethods,
    capabilities,
    ...(value.availabilityNote === undefined ? {} : { availabilityNote: stringValue(value.availabilityNote, "adapter availabilityNote") }),
  };
  if (!isJsonValue(descriptor)) throw new Error("adapter descriptor must be JSON-safe");
  return descriptor;
}
