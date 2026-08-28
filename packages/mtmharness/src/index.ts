/** Host assembly entry for the unified mtmharness DSH plugin. */
import type { Context } from "@deepseek-ai/cordis";
import { apply as applyCodingHost } from "./features/coding/index.ts";
import { apply as applyMtmConnectSettings } from "./features/mtm-connect/index.ts";

export { buildMcpConfig, resolveConfig } from "./features/coding/index.ts";
export { MODERN_GO_RESOURCE_BASE, createModernGoSkill } from "./features/coding/modern-go.ts";
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
export { MtmConnectSettingsSchema, SETTINGS_NAMESPACE as MTM_CONNECT_SETTINGS_NAMESPACE } from "./features/mtm-connect/index.ts";
export type { MtmConnectConfig, MtmConnectSettings } from "./features/mtm-connect/index.ts";
export { apply as applyCodebaseMemory } from "./features/coding/codebase-memory.ts";
export { apply as applyModernGo } from "./features/coding/modern-go.ts";
export { apply as applyPonytail } from "./features/coding/ponytail.ts";
export { apply as applyRtk } from "./features/coding/rtk.ts";
export {
  RTK_REWRITE_TIMEOUT_MS,
  RTK_VERSION,
  bindRtkExecutable,
  bashInput,
  ensureRtk,
  extractRtkBinary,
  resolveRtkHome,
  rewriteRtk,
  rtkAssetFor,
  rtkAssetUrl,
  rtkDisabled,
  rtkEnvironment,
} from "./features/coding/rtk-runtime.ts";
export type { MtmCodingConfig, MtmCodingSettings, PonytailMode, RtkMode } from "./features/coding/types.ts";
export type {
  MtmharnessFrontendExtension,
  MtmharnessFrontendExtensionCleanup,
  MtmharnessFrontendExtensionContext,
} from "./features/secondary/client.ts";

export const name = "mtmharness";
export const inject = ["settings"];

/** Mount the Host-owned MTM and coding control planes. */
export async function apply(ctx: Context, config: Record<string, unknown> = {}): Promise<void> {
  applyMtmConnectSettings(ctx, typeof config["mtm-connect"] === "object" && config["mtm-connect"] !== null ? config["mtm-connect"] as { enabled?: boolean } : {});
  await applyCodingHost(ctx, config);
}
