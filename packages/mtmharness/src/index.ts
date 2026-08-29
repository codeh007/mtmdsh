/** Host assembly entry for the unified mtmharness DSH plugin. */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import { apply as applyCodingHost } from "./features/coding/index.ts";
import { apply as applyMtmConnectSettings } from "./features/mtm-connect/index.ts";
import { apply as applyUpdateHost } from "./features/update/index.ts";

export { buildMcpConfig, resolveConfig, MTM_CODING_PACKAGES } from "./features/coding/index.ts";
export type { MtmCodingPackageKind, MtmCodingPackageManifest } from "./features/coding/manifest.ts";
export {
  extractHookContext,
  resolveBundledCommand,
  resolveCommand,
  resolveEnvironment,
  resolveWorkingDirectory,
} from "./features/coding/runtime.ts";
export { apply as applyCoding } from "./features/coding/index.ts";
export { MtmConnectSettingsSchema, SETTINGS_NAMESPACE as MTM_CONNECT_SETTINGS_NAMESPACE } from "./features/mtm-connect/index.ts";
export type { MtmConnectConfig, MtmConnectSettings } from "./features/mtm-connect/index.ts";
export { apply as applyCodebaseMemory } from "./features/coding/codebase-memory.ts";
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
  shouldRewriteRtk,
} from "./features/coding/rtk-runtime.ts";
export type { MtmCodingConfig, MtmCodingSettings, PonytailMode, RtkMode } from "./features/coding/types.ts";
export type {
  MtmharnessFrontendExtension,
  MtmharnessFrontendExtensionCleanup,
  MtmharnessFrontendExtensionContext,
} from "./features/secondary/client.ts";

export const name = "mtmharness";
export const inject = ["connection", "settings", "subprocess"];

/** Mount the Host-owned MTM and coding control planes. */
export async function apply(ctx: Context, config: Record<string, unknown> = {}): Promise<void> {
  if (ctx.connection === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyMtmConnectSettings(ctx, typeof config["mtm-connect"] === "object" && config["mtm-connect"] !== null ? config["mtm-connect"] as { enabled?: boolean } : {});
  applyUpdateHost(ctx);
  await applyCodingHost(ctx, config);
}
