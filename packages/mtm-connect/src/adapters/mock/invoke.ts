import type { JsonObject } from "../../contract/json.ts";

export type MockInvocationResult =
  | { readonly ok: true; readonly simulated: true; readonly summary: string; readonly data: JsonObject }
  | { readonly ok: false; readonly code: "unsupported-operation" | "invalid-input"; readonly message: string };

function numberInput(input: JsonObject, key: string): number | undefined {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function invokeMockCapability(
  adapterId: string,
  capabilityId: string,
  operationId: string,
  input: JsonObject,
): MockInvocationResult {
  if (adapterId === "mock-world" && capabilityId === "workspace.execution" && operationId === "workspace.list") {
    const path = typeof input.path === "string" && input.path.length > 0 ? input.path : "/workspace/demo";
    return {
      ok: true,
      simulated: true,
      summary: "Fixture workspace is reachable",
      data: {
        path,
        entries: [
          { name: "README.md", kind: "file", size: 1842 },
          { name: "src", kind: "directory", size: 0 },
          { name: "package.json", kind: "file", size: 912 },
        ],
        filesystem: "mock-world",
      },
    };
  }
  if (adapterId === "mock-world" && capabilityId === "workspace.execution" && operationId === "process.list") {
    return {
      ok: true,
      simulated: true,
      summary: "Fixture process table is available",
      data: {
        processes: [
          { pid: 214, command: "dsh web", status: "running" },
          { pid: 421, command: "node worker.mjs", status: "sleeping" },
        ],
        processWorld: "mock-world",
      },
    };
  }
  if (adapterId === "mock-device" && capabilityId === "device.control" && operationId === "screen.snapshot") {
    return {
      ok: true,
      simulated: true,
      summary: "Fixture device screen captured",
      data: {
        target: "Pixel 8 fixture",
        resolution: "1080x2400",
        foregroundApp: "Settings",
        screen: "mock://android/settings",
      },
    };
  }
  if (adapterId === "mock-device" && capabilityId === "device.control" && operationId === "input.tap") {
    const x = numberInput(input, "x");
    const y = numberInput(input, "y");
    if (x === undefined || y === undefined || x < 0 || y < 0) return { ok: false, code: "invalid-input", message: "input.tap requires non-negative x and y coordinates" };
    return {
      ok: true,
      simulated: true,
      summary: "Fixture device accepted the tap",
      data: { target: "Pixel 8 fixture", x, y, accepted: true },
    };
  }
  return { ok: false, code: "unsupported-operation", message: "The selected fixture does not implement this operation" };
}
