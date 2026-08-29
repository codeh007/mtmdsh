import { describe, expect, it } from "vitest";
import { ConnectRuntime } from "./runtime.ts";

describe("mtm-connect mock runtime", () => {
  it("starts with a selectable online device and offline workstation", () => {
    const runtime = new ConnectRuntime(() => 1_700_000_000_000);
    expect(runtime.getSnapshot()).toMatchObject({
      selectedId: "mock-android",
      notice: "Mock backend",
      connections: [
        { id: "mock-android", status: "online", generation: 1 },
        { id: "mock-workstation", status: "offline", generation: 0 },
      ],
    });
  });

  it("toggles a connection and advances its generation", () => {
    const runtime = new ConnectRuntime(() => 1_700_000_000_000);
    runtime.toggle("mock-workstation");
    expect(runtime.getSnapshot().connections[1]).toMatchObject({ status: "online", generation: 1, latencyMs: 82 });
    runtime.toggle("mock-workstation");
    expect(runtime.getSnapshot().connections[1]).toMatchObject({ status: "offline", generation: 2, latencyMs: 0 });
  });

  it("reports unknown selections without changing the selected connection", () => {
    const runtime = new ConnectRuntime();
    runtime.select("missing");
    expect(runtime.getSnapshot()).toMatchObject({ selectedId: "mock-android", error: "Connection was not found" });
  });

  it("stops publishing after disposal", () => {
    const runtime = new ConnectRuntime();
    let updates = 0;
    runtime.subscribe(() => { updates += 1; });
    runtime.dispose();
    runtime.refresh();
    expect(updates).toBe(0);
  });
});
