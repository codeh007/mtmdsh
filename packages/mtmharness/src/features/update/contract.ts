export const MTM_UPDATE_CHANNEL = "/mtm-update";

export type MtmUpdateRpcRequest =
  | { readonly kind: "check" }
  | { readonly kind: "update" };

export type MtmUpdateStatus = "current" | "available" | "updated" | "ahead" | "unavailable" | "failed";

export interface MtmUpdateResponse {
  readonly currentVersion: string | null;
  readonly latestVersion: string | null;
  readonly status: MtmUpdateStatus;
  readonly error: string | null;
  readonly restartRequired: boolean;
}

const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const STATUSES: readonly MtmUpdateStatus[] = ["current", "available", "updated", "ahead", "unavailable", "failed"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) throw new Error(label + " contains unsupported field: " + key);
  }
}

function versionValue(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) throw new Error(label + " must be a stable semantic version or null");
  return value;
}

export function parseMtmUpdateRpcRequest(value: unknown): MtmUpdateRpcRequest {
  if (!isRecord(value) || typeof value.kind !== "string") throw new Error("mtm-update RPC request is invalid");
  switch (value.kind) {
    case "check":
      exactKeys(value, ["kind"], "check request");
      return { kind: "check" };
    case "update":
      exactKeys(value, ["kind"], "update request");
      return { kind: "update" };
    default:
      throw new Error("unsupported mtm-update RPC request");
  }
}

export function assertMtmUpdateResponse(value: unknown): asserts value is MtmUpdateResponse {
  if (!isRecord(value)) throw new Error("mtm-update RPC returned an invalid response");
  exactKeys(value, ["currentVersion", "latestVersion", "status", "error", "restartRequired"], "mtm-update response");
  versionValue(value.currentVersion, "currentVersion");
  versionValue(value.latestVersion, "latestVersion");
  if (!STATUSES.includes(value.status as MtmUpdateStatus)) throw new Error("mtm-update response status is invalid");
  if (typeof value.error !== "string" && value.error !== null) throw new Error("mtm-update response error is invalid");
  if (typeof value.restartRequired !== "boolean") throw new Error("mtm-update response restartRequired is invalid");
}
