/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import { apply as applyCoding } from "../features/coding/client/index.tsx";
import { apply as applyMtmConnect } from "../features/mtm-connect/client/index.tsx";
import { apply as applySecondary } from "../features/secondary/client.ts";
import { MtmHarnessLauncherAction, MtmHarnessLauncherOverlay } from "./launcher.tsx";
import { disposeMtmHarnessLauncher } from "./launcher-state.ts";

export { applyCoding };
export const inject = ["slots", "locale", "settingsScope"];

/** Register coding, secondary, and launcher features under one plugin-owned lifecycle. */
export function apply(ctx: ClientContext): void {
  applyCoding(ctx);
  applyMtmConnect(ctx);
  applySecondary(ctx);
  // The launcher loads the latest stable app directly from the package CDN.
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtmdsh-launcher",
    order: 12,
    label: "MTM Cloud",
  }, MtmHarnessLauncherAction));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register({
    name: "shell.overlay",
    id: "mtmdsh-launcher-overlay",
    order: 100,
    label: "MTM Cloud",
  }, MtmHarnessLauncherOverlay));
  ctx.effect(() => () => { disposeMtmHarnessLauncher(); }, "mtmharness: launcher state");
}
