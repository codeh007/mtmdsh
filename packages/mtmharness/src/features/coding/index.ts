import type { Context, Fiber } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";
import { apply as applyCodebaseMemory, type Config as CodebaseMemoryConfig } from "./codebase-memory.js";
import { apply as applyPonytail } from "./ponytail.js";
import { applyDataOnlyPackages } from "./manifest.js";
import { apply as applyRtk } from "./rtk.js";
import {
  MtmCodingSettingsSchema,
  codebaseMemoryConfig,
  type MtmCodingConfig,
  type MtmCodingSettings,
} from "./types.js";

export { buildMcpConfig, resolveConfig } from "./codebase-memory.js";
export { MtmCodingSettingsSchema, codebaseMemoryConfig } from "./types.js";
export { MTM_CODING_PACKAGES, codingPackage } from "./manifest.js";
export type { MtmCodingPackageCatalog, MtmCodingPackageKind, MtmCodingPackageManifest, MtmCodingSkillSource } from "./manifest.js";
export {
  extractHookContext,
  resolveBundledCommand,
  resolveCommand,
  resolveEnvironment,
  resolveWorkingDirectory,
} from "./runtime.js";
export { apply as applyCodebaseMemory } from "./codebase-memory.js";
export { apply as applyPonytail } from "./ponytail.js";
export { apply as applyRtk } from "./rtk.js";
export type { MtmCodingConfig, MtmCodingSettings, PonytailMode, RtkMode } from "./types.js";

export const name = "mtm-coding";
export const inject = ["settings"];

const CodebaseMemoryFeature = {
  name: "mtm-coding-codebase-memory",
  inject: ["systemPrompt", "subprocess"],
  apply: applyCodebaseMemory,
};

const DataOnlyFeature = {
  name: "mtm-coding-data-only",
  inject: ["skills", "systemPrompt"],
  apply: applyDataOnlyPackages,
};

const PonytailFeature = {
  name: "mtm-coding-ponytail",
  inject: ["systemPrompt", "skills", "commands"],
  apply: applyPonytail,
};

const RtkFeature = {
  name: "mtm-coding-rtk",
  inject: ["systemPrompt", "commands"],
  apply: applyRtk,
};

type MountedFiber = Pick<Fiber, "dispose">;

async function dispose(fiber: MountedFiber | undefined): Promise<void> {
  if (fiber !== undefined) await fiber.dispose();
}

function jsonKey(value: unknown): string {
  return JSON.stringify(value) ?? "";
}

function codebaseKey(settings: MtmCodingSettings): string {
  return jsonKey({
    enabled: settings.codebaseMemoryEnabled,
    ...codebaseMemoryConfig(settings),
  });
}

function ponytailKey(settings: MtmCodingSettings): string {
  return jsonKey({
    enabled: settings.ponytailEnabled,
    mode: settings.ponytailMode,
    applyToSubagents: settings.ponytailSubagents,
  });
}

function rtkKey(settings: MtmCodingSettings): string {
  return jsonKey({
    mode: settings.rtkMode,
  });
}

/** Mount the unified coding domains and expose one persisted settings namespace. */
export async function apply(ctx: Context, rawConfig: MtmCodingConfig = {}): Promise<void> {
  const settings = ctx.settings.register(
    "mtm-coding",
    MtmCodingSettingsSchema,
    { base: rawConfig },
  );
  let codebaseMemoryFiber: MountedFiber | undefined;
  let ponytailFiber: MountedFiber | undefined;
  let rtkFiber: MountedFiber | undefined;
  let activeCodebaseKey = "";
  let activePonytailKey = "";
  let activeRtkKey = "";
  let reconciling = Promise.resolve();
  let stopped = false;

  const reconcile = async (next: MtmCodingSettings): Promise<void> => {
    const nextCodebaseKey = codebaseKey(next);
    const nextPonytailKey = ponytailKey(next);
    const nextRtkKey = rtkKey(next);

    if (nextCodebaseKey !== activeCodebaseKey || (next.codebaseMemoryEnabled && codebaseMemoryFiber === undefined)) {
      await dispose(codebaseMemoryFiber);
      codebaseMemoryFiber = undefined;
      activeCodebaseKey = "";
      if (next.codebaseMemoryEnabled) {
        try {
          codebaseMemoryFiber = await ctx.plugin(
            CodebaseMemoryFeature,
            codebaseMemoryConfig(next) as CodebaseMemoryConfig,
          );
          activeCodebaseKey = nextCodebaseKey;
        } catch (error) {
          ctx.logger.warn("mtm-coding: Codebase Memory is unavailable: " + String(error));
        }
      } else {
        activeCodebaseKey = nextCodebaseKey;
      }
    }

    if (nextPonytailKey !== activePonytailKey || (next.ponytailEnabled && ponytailFiber === undefined)) {
      await dispose(ponytailFiber);
      ponytailFiber = undefined;
      activePonytailKey = "";
      if (next.ponytailEnabled) {
        try {
          ponytailFiber = await ctx.plugin(PonytailFeature, {
            mode: next.ponytailMode,
            applyToSubagents: next.ponytailSubagents,
          });
          activePonytailKey = nextPonytailKey;
        } catch (error) {
          ctx.logger.warn("mtm-coding: Ponytail is unavailable: " + String(error));
        }
      } else {
        activePonytailKey = nextPonytailKey;
      }
    }

    if (nextRtkKey !== activeRtkKey || (next.rtkMode !== "off" && rtkFiber === undefined)) {
      await dispose(rtkFiber);
      rtkFiber = undefined;
      activeRtkKey = "";
      if (next.rtkMode !== "off" && typeof ctx.plugin === "function") {
        try {
          rtkFiber = await ctx.plugin(RtkFeature, { mode: next.rtkMode });
          activeRtkKey = nextRtkKey;
        } catch (error) {
          ctx.logger.warn("mtm-coding: RTK is unavailable: " + String(error));
        }
      } else {
        activeRtkKey = nextRtkKey;
      }
    }
  };

  const queueReconcile = (): Promise<void> => {
    reconciling = reconciling
      .then(() => reconcile(settings.get()))
      .catch((error: unknown) => {
        ctx.logger.error("mtm-coding settings reconciliation failed: " + String(error));
      });
    return reconciling;
  };
  const stopWatching = settings.watch(() => {
    if (stopped) return;
    return queueReconcile();
  });

  ctx.effect(() => async () => {
    stopped = true;
    stopWatching();
    await reconciling;
  }, "mtm-coding.lifecycle");

  if (typeof ctx.plugin === "function") await ctx.plugin(DataOnlyFeature);
  await queueReconcile();
}
