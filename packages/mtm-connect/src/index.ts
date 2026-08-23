import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import { MtmConnectRegistry, type MtmConnectRegistryOptions } from "./core/registry.ts";
import type { MtmConnectSnapshot } from "./contract/connection.ts";
import { MTM_CONNECT_CHANNEL, parseMtmConnectRpcRequest } from "./contract/rpc.ts";

export { createAdapterCatalog, installedAdapters } from "./adapters/catalog.ts";
export { invokeMockCapability } from "./adapters/mock/invoke.ts";
export * from "./contract/adapter.ts";
export * from "./contract/connection.ts";
export * from "./contract/event.ts";
export * from "./contract/json.ts";
export * from "./contract/rpc.ts";
export * from "./contract/snapshot.ts";
export { MtmConnectRegistry, createDemoRegistry } from "./core/registry.ts";
export type { InvocationActor, MtmConnectRegistryOptions } from "./core/registry.ts";

export const name = "mtm-connect";
export const inject = ["connection"];

type RpcResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: "internal"; readonly message: string; readonly details: Record<string, never> } };

export interface MtmConnectHostConfig {
  readonly ownerId?: string;
  readonly seed?: boolean;
}

export interface MtmConnectHostService {
  readonly registry: MtmConnectRegistry;
  getSnapshot(): MtmConnectSnapshot;
  restoreSnapshot(snapshot: MtmConnectSnapshot): void;
}

declare module "@deepseek-ai/cordis" {
  interface Context {
    mtmConnect: MtmConnectHostService;
  }
}

function hostService(registry: MtmConnectRegistry): MtmConnectHostService {
  return {
    registry,
    getSnapshot: registry.getSnapshot,
    restoreSnapshot: (snapshot) => { registry.restoreSnapshot(snapshot); },
  };
}

function failure(error: unknown): RpcResult<never> {
  return {
    ok: false,
    error: {
      code: "internal",
      message: error instanceof Error ? error.message : String(error),
      details: {},
    },
  };
}

export function createMtmConnectRpcHandler(registry: MtmConnectRegistry): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>> {
  return async (endpoint, payload, _signal) => {
  if (endpoint !== "request") return failure(new Error("mtm-connect: unknown RPC endpoint"));
  try {
    const request = parseMtmConnectRpcRequest((payload as { args?: unknown } | null)?.args);
    if (request.kind === "snapshot") return { ok: true, value: registry.getSnapshot() };
    if (request.kind === "mutate") return { ok: true, value: registry.applyMutation(request.mutation) };
    return { ok: true, value: registry.invoke(request.request) };
    } catch (error) {
      return failure(error);
    }
  };
}

/** Install the Host-owned registry and expose it over DSH's loopback RPC seam. */
export function apply(ctx: Context, config: MtmConnectHostConfig = {}): void {
  const options: MtmConnectRegistryOptions = {
    ownerId: config.ownerId ?? "local-demo-user",
    seed: config.seed ?? true,
  };
  const registry = new MtmConnectRegistry(options);
  ctx.provide("mtmConnect", hostService(registry));
  ctx.effect(() => {
    const remove = ctx.connection.rpc.handle(
      MTM_CONNECT_CHANNEL,
      createMtmConnectRpcHandler(registry),
      { authority: "loopback" },
    );
    return async () => {
      await remove();
      registry.dispose();
    };
  }, "mtm-connect: Host registry and RPC");
}
