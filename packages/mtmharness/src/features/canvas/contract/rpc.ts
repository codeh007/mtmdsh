import type { CanvasDocument } from "./canvas.ts";

export const MTM_CANVAS_CHANNEL = "/mtm-canvas";
export type CanvasRpcRequest =
  | { kind: "list" }
  | { kind: "read"; name: string }
  | { kind: "create"; name: string; document: unknown }
  | { kind: "write"; name: string; version: string; document: unknown };
export interface CanvasFileWire { name: string; version: string }
export interface CanvasReadWire { name: string; version: string; document: CanvasDocument }
export interface CanvasWriteWire extends CanvasReadWire {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error(label + " contains unsupported fields");
}
function nameValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) throw new Error("canvas name is invalid");
  return value;
}
function versionValue(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 256) throw new Error("canvas version is invalid");
  return value;
}
export function parseCanvasRpcRequest(value: unknown): CanvasRpcRequest {
  if (!isRecord(value) || typeof value.kind !== "string") throw new Error("invalid canvas request");
  switch (value.kind) {
    case "list": exactKeys(value, ["kind"], "canvas list request"); return { kind: "list" };
    case "read": exactKeys(value, ["kind", "name"], "canvas read request"); return { kind: "read", name: nameValue(value.name) };
    case "create": exactKeys(value, ["kind", "name", "document"], "canvas create request"); return { kind: "create", name: nameValue(value.name), document: value.document };
    case "write": exactKeys(value, ["kind", "name", "version", "document"], "canvas write request"); return { kind: "write", name: nameValue(value.name), version: versionValue(value.version), document: value.document };
    default: throw new Error("unsupported canvas request");
  }
}
