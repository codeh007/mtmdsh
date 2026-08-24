import { describe, expect, it } from "vitest";
import { createAdapterCatalog } from "../adapters/catalog.ts";
import { validateAdapterDescriptor } from "../contract/adapter.ts";
import type { ExternalConnectionEvent } from "../contract/event.ts";
import { MtmConnectRegistry } from "./registry.ts";

function clock(): { now: () => number; advance: (amount?: number) => void } {
  let value = 1_700_000_000_000;
  return { now: () => value, advance: (amount = 1) => { value += amount; } };
}

function event(connectionId: string, capabilityId: string, generation: number, key: string): ExternalConnectionEvent {
  return {
    eventId: "event-" + key,
    connectionId,
    capabilityId,
    generation,
    occurredAt: 1_700_000_000_001,
    kind: capabilityId === "device.control" ? "device.notification" : "workspace.changed",
    payload: { source: "fixture" },
    dedupeKey: key,
    source: "mock-adapter",
  };
}

describe("mtm-connect registry", () => {
  it("starts with user-owned disabled fixture connections", () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: true, now: clock().now });
    const snapshot = registry.getSnapshot();
    expect(snapshot.ownerId).toBe("user-1");
    expect(snapshot.connections).toHaveLength(2);
    expect(snapshot.connections.every((record) => record.instance.desired === "disabled")).toBe(true);
    expect(snapshot.connections.every((record) => record.observation.status === "configured")).toBe(true);
  });

  it("fences old channel generations and deduplicates event projections", () => {
    const timer = clock();
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: true, now: timer.now });
    registry.enable("mock-workstation");
    const online = registry.getConnection("mock-workstation");
    expect(online?.observation).toMatchObject({ status: "online", generation: 1 });

    const stale = registry.dispatchExternalEvent("mock-workstation", event("mock-workstation", "workspace.execution", 0, "stale"));
    expect(stale).toMatchObject({ disposition: "dropped", reason: "stale-generation" });

    const current = registry.dispatchExternalEvent("mock-workstation", event("mock-workstation", "workspace.execution", 1, "change-1"));
    expect(current).toMatchObject({ disposition: "observed", policy: "observe" });
    registry.setCapabilityPolicy("mock-workstation", "workspace.execution", { eventPolicy: "inject-next" });
    const queued = registry.dispatchExternalEvent("mock-workstation", event("mock-workstation", "workspace.execution", 1, "change-2"));
    expect(queued).toMatchObject({ disposition: "queued", policy: "inject-next" });
    const duplicate = registry.dispatchExternalEvent("mock-workstation", event("mock-workstation", "workspace.execution", 1, "change-2"));
    expect(duplicate).toMatchObject({ disposition: "dropped", reason: "duplicate-dedupe-key" });
    expect(registry.getSnapshot().eventHistory).toHaveLength(4);
  });

  it("supports user-controlled lifecycle and fail-closed invocation policy", () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: true, now: clock().now });
    registry.enable("mock-workstation");
    const online = registry.getConnection("mock-workstation");
    const generation = online?.observation.generation ?? 0;
    const modelDenied = registry.invokeCapability("mock-workstation", generation, "workspace.execution", "workspace.list", { path: "/workspace/demo" }, "model");
    expect(modelDenied).toMatchObject({ ok: false, code: "policy-denied" });
    const userResult = registry.invokeCapability("mock-workstation", generation, "workspace.execution", "workspace.list", { path: "/workspace/demo" }, "user");
    expect(userResult).toMatchObject({ ok: true, simulated: true });

    registry.setCapabilityPolicy("mock-workstation", "workspace.execution", { modelInvocable: true });
    const modelResult = registry.invokeCapability("mock-workstation", generation, "workspace.execution", "workspace.list", { path: "/workspace/demo" }, "model");
    expect(modelResult).toMatchObject({ ok: true, simulated: true });
    const stale = registry.invokeCapability("mock-workstation", generation - 1, "workspace.execution", "workspace.list", {}, "user");
    expect(stale).toMatchObject({ ok: false, code: "stale-generation" });

    registry.disable("mock-workstation");
    expect(registry.getConnection("mock-workstation")?.observation.status).toBe("offline");
    registry.revoke("mock-workstation");
    expect(registry.getConnection("mock-workstation")?.observation.status).toBe("revoked");
  });

  it("requires user approval for writes and never accepts model approval", () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: true, now: clock().now });
    registry.enable("mock-android");
    const generation = registry.getConnection("mock-android")?.observation.generation ?? 0;
    const denied = registry.invokeCapability("mock-android", generation, "device.control", "input.tap", { x: 10, y: 20 }, "user");
    expect(denied).toMatchObject({ ok: false, code: "approval-required" });
    const modelApproval = registry.invokeCapability("mock-android", generation, "device.control", "input.tap", { x: 10, y: 20 }, "model", true);
    expect(modelApproval).toMatchObject({ ok: false, code: "approval-required" });
    const approved = registry.invokeCapability("mock-android", generation, "device.control", "input.tap", { x: 10, y: 20 }, "user", true);
    expect(approved).toMatchObject({ ok: true, simulated: true });
  });

  it("rejects secrets, executable descriptors, owner forgery, and stale restores", () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: false });
    expect(() => registry.createConnection("mock-world", "Bad config", { metadata: { token: "nope" } })).toThrow("credential field");
    const descriptor = createAdapterCatalog()[1];
    expect(() => validateAdapterDescriptor({ ...descriptor, script: "alert(1)" })).toThrow("unsupported field");
    expect(() => validateAdapterDescriptor({
      ...descriptor,
      capabilities: descriptor.capabilities.map((capability) => ({
        ...capability,
        operations: capability.operations.map((operation) => operation.sideEffect === "write" ? { ...operation, requiresApproval: false } : operation),
      })),
    })).toThrow("must require approval");

    const seeded = new MtmConnectRegistry({ ownerId: "user-1", seed: true });
    const forged = JSON.parse(JSON.stringify(seeded.getSnapshot())) as Record<string, unknown>;
    const connections = forged.connections as Array<{ instance: { ownerId: string } }>;
    connections[0]!.instance.ownerId = "other-user";
    expect(() => new MtmConnectRegistry({ ownerId: "user-1", snapshot: forged as never })).toThrow("owner");
    const stale = new MtmConnectRegistry({ ownerId: "user-1", seed: true }).getSnapshot();
    seeded.enable("mock-workstation");
    expect(() => seeded.restoreSnapshot(stale)).toThrow("stale mtm-connect snapshot revision");
  });
});
