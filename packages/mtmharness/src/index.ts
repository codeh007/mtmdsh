/** Host assembly entry for the mtmharness DSH plugin. */
import type { Context } from "@deepseek-ai/cordis";
import { apply as applyConnectHost } from "./features/connect/index.ts";

export const name = "mtmharness";
export const inject = ["connection"];

/** Mount the Host-owned Connect control plane. */
export function apply(ctx: Context): void {
  if (ctx.connection === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyConnectHost(ctx);
}
