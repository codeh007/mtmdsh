import { describe, expect, it } from "vitest";
import type { CapabilityInvoker } from "../adapters/invoker.ts";
import { createMtmConnectRpcHandler } from "../index.ts";
import { MtmConnectRegistry } from "./registry.ts";

describe("mtm-connect capability invoker boundary", () => {
  it("routes validated provider context after policy checks", async () => {
    const calls: Array<Parameters<CapabilityInvoker>[0]> = [];
    const providerInvoker: CapabilityInvoker = async (context) => {
      calls.push(context);
      await Promise.resolve();
      return {
        ok: true,
        simulated: false,
        summary: "Provider read completed",
        data: { source: "provider", path: context.input.path ?? null },
      };
    };
    const registry = new MtmConnectRegistry({ ownerId: "user-1", seed: true, capabilityInvoker: providerInvoker });

    registry.enable("mock-workstation");
    const generation = registry.getConnection("mock-workstation")?.observation.generation ?? 0;
    const result = await registry.invokeCapability(
      "mock-workstation",
      generation,
      "workspace.execution",
      "workspace.list",
      { path: "/workspace/provider" },
      "user",
    );

    expect(result).toMatchObject({
      ok: true,
      simulated: false,
      adapterId: "mock-world",
      connectionId: "mock-workstation",
      capabilityId: "workspace.execution",
      operationId: "workspace.list",
      data: { source: "provider", path: "/workspace/provider" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      adapter: { id: "mock-world", version: "0.1.0" },
      capability: { id: "workspace.execution", role: "primary-world" },
      operation: { id: "workspace.list", sideEffect: "read", requiresApproval: false },
      connection: { id: "mock-workstation", adapterId: "mock-world", config: { root: "/workspace/demo" } },
      input: { path: "/workspace/provider" },
    });

    registry.enable("mock-android");
    const deviceGeneration = registry.getConnection("mock-android")?.observation.generation ?? 0;
    const deniedWrite = await registry.invokeCapability(
      "mock-android",
      deviceGeneration,
      "device.control",
      "input.tap",
      { x: 10, y: 20 },
      "user",
    );

    expect(deniedWrite).toMatchObject({ ok: false, code: "approval-required" });
    expect(calls).toHaveLength(1);
  });

  it("routes async execution through the Host RPC contract", async () => {
    const registry = new MtmConnectRegistry({
      ownerId: "user-1",
      seed: true,
      capabilityInvoker: async () => ({ ok: true, simulated: false, summary: "RPC provider read", data: { source: "rpc-provider" } }),
    });
    registry.enable("mock-workstation");
    const generation = registry.getConnection("mock-workstation")?.observation.generation ?? 0;
    const handler = createMtmConnectRpcHandler(registry);
    const response = await handler("request", {
      args: {
        kind: "invoke",
        request: {
          connectionId: "mock-workstation",
          generation,
          capabilityId: "workspace.execution",
          operationId: "workspace.list",
          input: {},
          actor: "user",
        },
      },
    }, new AbortController().signal);

    expect(response).toMatchObject({ ok: true, value: { ok: true, simulated: false, summary: "RPC provider read" } });
  });

  it("normalizes thrown, malformed, and unknown provider failures", async () => {
    const throwing = new MtmConnectRegistry({
      ownerId: "user-1",
      seed: true,
      capabilityInvoker: () => { throw new Error("provider secret"); },
    });
    throwing.enable("mock-workstation");
    const throwingGeneration = throwing.getConnection("mock-workstation")?.observation.generation ?? 0;
    await expect(throwing.invokeCapability("mock-workstation", throwingGeneration, "workspace.execution", "workspace.list", {}, "user"))
      .resolves.toMatchObject({ ok: false, code: "adapter-unavailable", message: "Adapter execution failed" });

    const malformed = new MtmConnectRegistry({
      ownerId: "user-1",
      seed: true,
      capabilityInvoker: (() => ({ ok: true, simulated: true, summary: 42, data: {} })) as unknown as CapabilityInvoker,
    });
    malformed.enable("mock-workstation");
    const malformedGeneration = malformed.getConnection("mock-workstation")?.observation.generation ?? 0;
    await expect(malformed.invokeCapability("mock-workstation", malformedGeneration, "workspace.execution", "workspace.list", {}, "user"))
      .resolves.toMatchObject({ ok: false, code: "adapter-unavailable", message: "Adapter execution failed" });

    const unknownFailure = new MtmConnectRegistry({
      ownerId: "user-1",
      seed: true,
      capabilityInvoker: (() => ({ ok: false, code: "provider-error", message: "not a public error" })) as unknown as CapabilityInvoker,
    });
    unknownFailure.enable("mock-workstation");
    const unknownGeneration = unknownFailure.getConnection("mock-workstation")?.observation.generation ?? 0;
    await expect(unknownFailure.invokeCapability("mock-workstation", unknownGeneration, "workspace.execution", "workspace.list", {}, "user"))
      .resolves.toMatchObject({ ok: false, code: "adapter-unavailable", message: "Adapter execution failed" });
  });
});
