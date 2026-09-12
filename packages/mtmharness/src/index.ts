/** Host assembly entry for the unified mtmharness DSH plugin. */
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import { apply as applyCodingHost } from "./features/coding/index.js";
import { apply as applyUpdateHost } from "./features/update/index.js";

export { buildMcpConfig, codingPackage, resolveConfig, MTM_CODING_PACKAGES } from "./features/coding/index.js";
export type { MtmCodingPackageCatalog, MtmCodingPackageKind, MtmCodingPackageManifest, MtmCodingSkillSource } from "./features/coding/manifest.js";
export {
  extractHookContext,
  resolveBundledCommand,
  resolveCommand,
  resolveEnvironment,
  resolveWorkingDirectory,
} from "./features/coding/runtime.js";
export { apply as applyCoding } from "./features/coding/index.js";
export { apply as applyCodebaseMemory } from "./features/coding/codebase-memory.js";
export { apply as applyPonytail } from "./features/coding/ponytail.js";
export { apply as applyRtk } from "./features/coding/rtk.js";
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
} from "./features/coding/rtk-runtime.js";
export type { MtmCodingConfig, MtmCodingSettings, PonytailMode, RtkMode } from "./features/coding/types.js";
export const name = "mtmharness";
export const inject = ["connection", "settings", "subprocess", "webServer"];

/** Mount the Host-owned MTM and coding control planes. */
export async function apply(ctx: Context, config: Record<string, unknown> = {}): Promise<void> {
  if (ctx.connection === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyUpdateHost(ctx);
  await applyCodingHost(ctx, config);
}
