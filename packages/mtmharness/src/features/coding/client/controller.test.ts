import { describe, expect, it } from "vitest";
import type { MtmUpdateResponse } from "../../update/contract.ts";
import { MtmCodingCardController } from "./controller.ts";

function settingsScope() {
  let snapshot = {
    status: "ready",
    value: { codebaseMemoryEnabled: true, dynamicCanvasEnabled: false, codebaseMemoryAugmentHooks: true, modernGoEnabled: true, ponytailEnabled: true, ponytailMode: "full", ponytailSubagents: true, rtkMode: "auto" },
    base: {},
    user: {},
    revision: 1,
    writable: true,
    mode: "host",
  };
  return {
    scope: {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      async set(field: string, value: unknown) { snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value }, user: { ...snapshot.user, [field]: value } }; },
      async unset(field: string) { const user = { ...snapshot.user }; delete user[field]; snapshot = { ...snapshot, user }; },
    },
  };
}

const response = (status: MtmUpdateResponse["status"], restartRequired = false): MtmUpdateResponse => ({
  currentVersion: "0.5.5",
  latestVersion: "0.6.0",
  status,
  error: null,
  restartRequired,
});

async function flush(): Promise<void> {
  await new Promise<void>((resolve) => { queueMicrotask(resolve); });
  await new Promise<void>((resolve) => { queueMicrotask(resolve); });
}

describe("MtmCodingCardController update actions", () => {
  it("hides update actions without a loopback RPC", () => {
    const { scope } = settingsScope();
    const controller = new MtmCodingCardController(scope as never);
    expect(controller.inject().hooks.mtmCodingCard.getSnapshot().update).toMatchObject({ available: false, status: "idle" });
    controller.dispose();
  });

  it("publishes checking, available, and restart-required states", async () => {
    const { scope } = settingsScope();
    let resolveRpc: ((result: unknown) => void) | undefined;
    const calls: unknown[] = [];
    const rpc = { call: async (_channel: string, _endpoint: string, payload: unknown) => {
      calls.push(payload);
      return await new Promise<unknown>((resolve) => { resolveRpc = resolve; });
    } };
    const controller = new MtmCodingCardController(scope as never, rpc as never);
    const face = controller.inject();
    face.checkForUpdate();
    expect(face.hooks.mtmCodingCard.getSnapshot().update).toMatchObject({ available: true, checking: true, updating: false });
    resolveRpc!({ ok: true, value: response("available") });
    await flush();
    expect(face.hooks.mtmCodingCard.getSnapshot().update).toMatchObject({ status: "available", checking: false, error: null });
    face.updatePackage();
    expect(face.hooks.mtmCodingCard.getSnapshot().update.updating).toBe(true);
    resolveRpc!({ ok: true, value: response("updated", true) });
    await flush();
    expect(face.hooks.mtmCodingCard.getSnapshot().update).toMatchObject({ status: "updated", updating: false, restartRequired: true });
    expect(calls).toEqual([
      { args: { kind: "check" } },
      { args: { kind: "update" } },
    ]);
    controller.dispose();
  });

  it("keeps the card alive and reports malformed Host responses as errors", async () => {
    const { scope } = settingsScope();
    const rpc = { call: async () => ({ ok: true, value: { status: "available" } }) };
    const controller = new MtmCodingCardController(scope as never, rpc as never);
    const face = controller.inject();
    face.checkForUpdate();
    await flush();
    expect(face.hooks.mtmCodingCard.getSnapshot().update).toMatchObject({ available: true, status: "failed", checking: false });
    expect(face.hooks.mtmCodingCard.getSnapshot().update.error).toContain("currentVersion");
    controller.dispose();
  });
});
