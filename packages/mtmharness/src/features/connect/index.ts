import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import type { CapabilityInvoker } from "./adapters/invoker.ts";
import { MtmConnectRegistry, type MtmConnectRegistryOptions } from "./core/registry.ts";
import type { MtmConnectSnapshot } from "./contract/connection.ts";
import type { MtmControlScope, MtmControlSnapshot } from "./contract/control-plane.ts";
import { MTM_CONNECT_CHANNEL, parseMtmConnectRpcRequest } from "./contract/rpc.ts";

type RpcResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: { readonly code: "internal"; readonly message: string; readonly details: Record<string, never> } };

interface MtmConnectHostConfig {
  readonly ownerId?: string;
  readonly seed?: boolean;
  readonly scope?: MtmControlScope;
  /** Supplies a local adapter executor; it must not bypass registry policy checks. */
  readonly capabilityInvoker?: CapabilityInvoker;
  /** Only a trusted control-plane bridge may enable this privileged RPC. */
  readonly allowControlReconcile?: boolean;
}

interface MtmConnectHostService {
  readonly registry: MtmConnectRegistry;
  getSnapshot(): MtmConnectSnapshot;
  restoreSnapshot(snapshot: MtmConnectSnapshot): void;
  reconcileControlSnapshot(snapshot: MtmControlSnapshot): MtmConnectSnapshot;
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
    reconcileControlSnapshot: (snapshot) => registry.reconcileControlSnapshot(snapshot),
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

export function createMtmConnectRpcHandler(registry: MtmConnectRegistry, options: { readonly allowControlReconcile?: boolean } = {}): (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcResult<unknown>> {
  return async (endpoint, payload, _signal) => {
  if (endpoint !== "request") return failure(new Error("mtm-connect: unknown RPC endpoint"));
  try {
    const request = parseMtmConnectRpcRequest((payload as { args?: unknown } | null)?.args);
    if (request.kind === "snapshot") return { ok: true, value: registry.getSnapshot() };
    if (request.kind === "mutate") return { ok: true, value: registry.applyMutation(request.mutation) };
    if (request.kind === "reconcile") {
      if (options.allowControlReconcile !== true) throw new Error("mtm-connect control reconciliation is restricted");
      return { ok: true, value: { snapshot: registry.reconcileControlSnapshot(request.snapshot) } };
    }
    return { ok: true, value: await registry.invoke(request.request) };
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
    scope: config.scope,
    capabilityInvoker: config.capabilityInvoker,
  };
  const registry = new MtmConnectRegistry(options);
  ctx.provide("mtmConnect", hostService(registry));
  ctx.effect(() => {
    const remove = ctx.connection.rpc.handle(
      MTM_CONNECT_CHANNEL,
      createMtmConnectRpcHandler(registry, { allowControlReconcile: config.allowControlReconcile === true }),
      { authority: "loopback" },
    );
    return async () => {
      await remove();
      registry.dispose();
    };
  }, "mtm-connect: Host registry and RPC");
}
