/** Host assembly entry for the unified mtmharness DSH plugin. */
import type { Context } from "@deepseek-ai/cordis";
import { apply as applyCodingHost } from "./features/coding/index.ts";
import { apply as applyConnectHost } from "./features/connect/index.ts";
import { apply as applyCanvasHost } from "./features/canvas/index.ts";

export { buildMcpConfig, resolveConfig } from "./features/coding/index.ts";
export { PONYTAIL_SKILLS } from "./features/coding/ponytail-skills.ts";
export {
  ensureRuntime,
  extractHookContext,
  extractNativeCommand,
  resolveBundledCommand,
  resolveCommand,
  resolveEnvironment,
  resolveWorkingDirectory,
} from "./features/coding/runtime.ts";
export { apply as applyCoding } from "./features/coding/index.ts";
export { apply as applyCodebaseMemory } from "./features/coding/codebase-memory.ts";
export { apply as applyPonytail } from "./features/coding/ponytail.ts";
export type { MtmCodingConfig, MtmCodingSettings, PonytailMode } from "./features/coding/types.ts";

export const name = "mtmharness";
export const inject = ["connection", "fs", "directoryPicker", "settings"];

/** Mount the Host-owned MTM and coding control planes. */
export async function apply(ctx: Context, config: Record<string, unknown> = {}): Promise<void> {
  if (ctx.connection === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyConnectHost(ctx);
  applyCanvasHost(ctx);
  await applyCodingHost(ctx, config);
}
