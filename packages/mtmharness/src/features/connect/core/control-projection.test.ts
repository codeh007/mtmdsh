import { describe, expect, it } from "vitest";
import type { CapabilityInvoker } from "../adapters/invoker.ts";
import { createAdapterCatalog } from "../adapters/catalog.ts";
import type { AdapterDescriptor } from "../contract/adapter.ts";
import type { MtmControlSnapshot } from "../contract/control-plane.ts";
import { validateMtmControlSnapshot } from "../contract/control-plane.ts";
import { MtmConnectRegistry } from "./registry.ts";

const scope = {
  sandboxId: "sbx_00000000-0000-4000-8000-000000000607",
  workspaceId: "ws_00000000-0000-4000-8000-000000000607",
  owner: { issuer: "https://auth.example.test", subject: "user-1" },
};

function controlSnapshot(overrides: Partial<MtmControlSnapshot> = {}): MtmControlSnapshot {
  const adapter = createAdapterCatalog().find((candidate) => candidate.id === "mock-world") as AdapterDescriptor;
  const controlAdapter = {
    adapterId: adapter.id,
    version: adapter.version,
    label: adapter.label,
    available: adapter.status === "installed",
    capabilities: adapter.capabilities.map((capability) => ({
      capabilityId: capability.id,
      version: capability.version,
      role: capability.role,
      operations: capability.operations.map((operation) => ({
        operationId: operation.id,
        sideEffect: operation.sideEffect,
        requiresApproval: operation.requiresApproval,
      })),
    })),
  };
  const capabilities = Object.fromEntries(adapter.capabilities.map((capability) => [capability.id, {
    capabilityId: capability.id,
    enabled: true,
    modelInvocable: capability.role !== "primary-world",
    userInvocable: true,
    eventPolicy: "observe" as const,
  }]));
  return {
    contractVersion: 2,
    scope,
    revision: 1,
    adapters: [controlAdapter],
    desiredWorlds: [{ worldId: "world-1", adapterId: adapter.id, config: { root: "/workspace" }, enabled: true, capabilities }],
    observedWorlds: [{ worldId: "world-1", adapterId: adapter.id, status: "online", generation: 4, channelId: "world-1:channel:4", lastSeenAt: 42 }],
    installation: { installationId: "installation-1", daemonId: "daemon-1", generation: 4, status: "active", boundAt: 1, heartbeatAt: 42, expiresAt: 9_000_000_000_000 },
    activeModelProfile: { tenantId: "tenant-1", profileId: "yuepa8-default", revision: 3 },
    ...overrides,
  };
}

describe("MtmConnectRegistry control projection", () => {
  it("projects desired, observed, generation, and policy into the local registry", () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope });
    registry.reconcileControlSnapshot(controlSnapshot());
    const connection = registry.getConnection("world-1");
    expect(registry.getControlRevision()).toBe(1);
    expect(registry.getSnapshot().activeModelProfile).toEqual({ tenantId: "tenant-1", profileId: "yuepa8-default", revision: 3 });
    expect(connection).toMatchObject({
      instance: { desired: "enabled", adapterId: "mock-world" },
      observation: { status: "online", generation: 4, channelId: "world-1:channel:4" },
    });
    const primary = connection?.instance.worldBinding?.capabilityId;
    expect(connection?.instance.bindings[primary ?? ""]?.modelInvocable).toBe(false);

    const restored = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope, snapshot: registry.getSnapshot() });
    expect(restored.getControlRevision()).toBe(1);
    expect(restored.getSnapshot().activeModelProfile).toEqual({ tenantId: "tenant-1", profileId: "yuepa8-default", revision: 3 });
    expect(restored.reconcileControlSnapshot({ ...controlSnapshot(), revision: 0 })).toEqual(restored.getSnapshot());
  });

  it("passes the authoritative profile reference to the injected invoker", async () => {
    const calls: Array<Parameters<CapabilityInvoker>[0]> = [];
    const invoker: CapabilityInvoker = async (context) => {
      calls.push(context);
      return { ok: true, simulated: false, summary: "profile-aware read", data: {} };
    };
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope, capabilityInvoker: invoker });
    registry.reconcileControlSnapshot(controlSnapshot());

    const result = await registry.invokeCapability("world-1", 4, "workspace.execution", "workspace.list", {}, "user");
    expect(result).toMatchObject({ ok: true, summary: "profile-aware read" });
    expect(calls[0]?.modelProfile).toEqual({ tenantId: "tenant-1", profileId: "yuepa8-default", revision: 3 });
  });

  it("ignores out-of-order control revisions and rejects foreign scope or generation", async () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope });
    registry.reconcileControlSnapshot(controlSnapshot());
    const before = registry.getSnapshot();
    registry.reconcileControlSnapshot({ ...controlSnapshot(), revision: 0 });
    expect(registry.getSnapshot()).toEqual(before);

    expect(() => registry.reconcileControlSnapshot({ ...controlSnapshot(), revision: 2, scope: { ...scope, owner: { ...scope.owner, subject: "user-2" } } })).toThrow("owner");
    expect(() => registry.reconcileControlSnapshot({ ...controlSnapshot(), revision: 2, observedWorlds: [{ ...controlSnapshot().observedWorlds[0]!, generation: 3 }], installation: { ...controlSnapshot().installation!, generation: 3 } })).toThrow("generation");
    expect(() => registry.reconcileControlSnapshot({ ...controlSnapshot(), revision: 2, adapters: [{ ...controlSnapshot().adapters[0]!, version: "9.9.9" }] })).toThrow("descriptor");
    expect(() => registry.reconcileControlSnapshot({ ...controlSnapshot(), revision: 2, desiredWorlds: [{ ...controlSnapshot().desiredWorlds[0]!, config: { value: "Bearer opaque-value" } }] })).toThrow("secret");

    const expiredRegistry = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope, now: () => 100 });
    const expired = controlSnapshot({
      installation: { ...controlSnapshot().installation!, heartbeatAt: 42, expiresAt: 42 },
    });
    expiredRegistry.reconcileControlSnapshot(expired);
    expect(expiredRegistry.getConnection("world-1")?.observation.status).toBe("offline");

    let clock = 50;
    const expiringRegistry = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope, now: () => clock });
    expiringRegistry.reconcileControlSnapshot(controlSnapshot({ installation: { ...controlSnapshot().installation!, expiresAt: 100 } }));
    const primaryCapability = expiringRegistry.getConnection("world-1")?.instance.worldBinding?.capabilityId ?? "";
    const operationId = expiringRegistry.getAdapter("mock-world")?.capabilities.find((capability) => capability.id === primaryCapability)?.operations[0]?.id ?? "";
    clock = 101;
    expect(await expiringRegistry.invokeCapability("world-1", 4, primaryCapability, operationId, { path: "/workspace" }, "user")).toMatchObject({ ok: false, code: "connection-offline" });
  });

  it("fails closed for revoked installations and secret-bearing snapshots", () => {
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: false, scope });
    const observed = controlSnapshot().observedWorlds[0]!;
    const revokedObserved = { worldId: observed.worldId, adapterId: observed.adapterId, generation: observed.generation };
    const revoked = controlSnapshot({
      revision: 1,
      installation: { ...controlSnapshot().installation!, status: "revoked", revokedAt: 50 },
      desiredWorlds: [{ ...controlSnapshot().desiredWorlds[0]!, enabled: false }],
      observedWorlds: [{ ...revokedObserved, status: "revoked" }],
    });
    registry.reconcileControlSnapshot(revoked);
    expect(registry.getConnection("world-1")?.observation.status).toBe("revoked");

    const secret = controlSnapshot({ desiredWorlds: [{ ...controlSnapshot().desiredWorlds[0]!, config: { refresh_token: "no" } }] });
    expect(() => validateMtmControlSnapshot(secret)).toThrow("secret");
    expect(() => validateMtmControlSnapshot(controlSnapshot({ activeModelProfile: { tenantId: "tenant-1", profileId: "yuepa8-default", revision: 0 } }))).toThrow("revision");
    expect(() => validateMtmControlSnapshot(controlSnapshot({ activeModelProfile: { tenantId: "tenant-1", profileId: "yuepa8-default", revision: 3, credentialRef: "managed" } as never }))).toThrow("unsupported field");
    const missingProfile = { ...controlSnapshot() } as Record<string, unknown>;
    delete missingProfile.activeModelProfile;
    expect(() => validateMtmControlSnapshot(missingProfile)).toThrow("mtm model profile");
    const mismatchedObserved = controlSnapshot({ observedWorlds: [{ ...controlSnapshot().observedWorlds[0]!, adapterId: "mock-device" }] });
    expect(() => validateMtmControlSnapshot(mismatchedObserved)).toThrow("observed world");
  });
});
