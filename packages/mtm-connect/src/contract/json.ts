export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (!isRecord(value)) return false;
  return Object.values(value).every(isJsonValue);
}

export function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function jsonByteLength(value: JsonValue): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

const SECRET_KEY_PATTERN = /(?:password|secret|token|private[_-]?key|client[_-]?secret)/i;

export function assertPublicConfig(config: JsonObject): void {
  const visit = (value: JsonValue, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => { visit(item, path + "[" + index + "]"); });
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) throw new Error("connection config cannot contain credential field: " + path + key);
      visit(child as JsonValue, path + key + ".");
    }
  };
  if (!isJsonValue(config)) throw new Error("connection config must contain JSON-safe values");
  visit(config, "");
}
