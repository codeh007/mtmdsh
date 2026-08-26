import type { Context, Fiber } from "@deepseek-ai/cordis";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import { apply as applyCodebaseMemory, type Config as CodebaseMemoryConfig } from "./features/codebase-memory.js";
import { apply as applyPonytail } from "./features/ponytail.js";
import {
  MtmCodingSettingsSchema,
  codebaseMemoryConfig,
  type MtmCodingConfig,
  type MtmCodingSettings,
} from "./types.js";

export { buildMcpConfig, resolveConfig } from "./features/codebase-memory.js";
export { MtmCodingSettingsSchema, codebaseMemoryConfig } from "./types.js";
export type { MtmCodingConfig, MtmCodingSettings, PonytailMode } from "./types.js";

export const name = "mtm-coding";
export const inject = ["settings"];

const CodebaseMemoryFeature = {
  name: "mtm-coding-codebase-memory",
  inject: ["systemPrompt", "subprocess"],
  apply: applyCodebaseMemory,
};

const PonytailFeature = {
  name: "mtm-coding-ponytail",
  inject: ["systemPrompt", "skills", "commands"],
  apply: applyPonytail,
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

/** Mount the unified coding domains and expose one persisted settings namespace. */
export async function apply(ctx: Context, rawConfig: MtmCodingConfig = {}): Promise<void> {
  const settings = ctx.settings.register(
    settingsNamespace("mtm-coding"),
    MtmCodingSettingsSchema,
    { base: rawConfig },
  );
  let codebaseMemoryFiber: MountedFiber | undefined;
  let ponytailFiber: MountedFiber | undefined;
  let activeCodebaseKey = "";
  let activePonytailKey = "";
  let reconciling = Promise.resolve();
  let stopped = false;

  const reconcile = async (next: MtmCodingSettings): Promise<void> => {
    const nextCodebaseKey = codebaseKey(next);
    const nextPonytailKey = ponytailKey(next);

    if (nextCodebaseKey !== activeCodebaseKey) {
      await dispose(codebaseMemoryFiber);
      codebaseMemoryFiber = undefined;
      activeCodebaseKey = "";
      if (next.codebaseMemoryEnabled) {
        codebaseMemoryFiber = await ctx.plugin(
          CodebaseMemoryFeature,
          codebaseMemoryConfig(next) as CodebaseMemoryConfig,
        );
      }
      activeCodebaseKey = nextCodebaseKey;
    }

    if (nextPonytailKey !== activePonytailKey) {
      await dispose(ponytailFiber);
      ponytailFiber = undefined;
      activePonytailKey = "";
      if (next.ponytailEnabled) {
        ponytailFiber = await ctx.plugin(PonytailFeature, {
          mode: next.ponytailMode,
          applyToSubagents: next.ponytailSubagents,
        });
      }
      activePonytailKey = nextPonytailKey;
    }
  };

  await reconcile(settings.get());
  const stopWatching = settings.watch(() => {
    if (stopped) return;
    reconciling = reconciling
      .then(() => reconcile(settings.get()))
      .catch((error: unknown) => {
        ctx.logger.error("mtm-coding settings reconciliation failed: " + String(error));
      });
    return reconciling;
  });

  ctx.effect(() => async () => {
    stopped = true;
    stopWatching();
    await reconciling;
    await dispose(ponytailFiber);
    await dispose(codebaseMemoryFiber);
    ponytailFiber = undefined;
    codebaseMemoryFiber = undefined;
  }, "mtm-coding.lifecycle");
}
