/** Host assembly entry for the mtmharness DSH plugin. */
import type { Context } from "@deepseek-ai/cordis";
import { apply as applyConnectHost } from "./features/connect/index.ts";
import { apply as applyCanvasHost } from "./features/canvas/index.ts";

export const name = "mtmharness";
export const inject = ["connection", "fs", "directoryPicker"];

/** Mount the Host-owned MTM control planes. */
export function apply(ctx: Context): void {
  if (ctx.connection === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyConnectHost(ctx);
  applyCanvasHost(ctx);
}
