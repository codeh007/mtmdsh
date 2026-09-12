/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import { apply as applyCoding } from "../features/coding/client/index.tsx";
import { apply as applyMtmCanvas } from "mtmcanvas";
import { apply as applyMtmP2p } from "../features/p2p/client.ts";

export { applyCoding };
export const inject = ["slots", "locale", "settingsScope", "connection"];

/** Compose all MTM client packages under the mtmharness Cordis fiber. */
export async function apply(ctx: ClientContext): Promise<void> {
  applyMtmCanvas(ctx, { enabled: false });
  applyMtmP2p(ctx);
  applyCoding(ctx);

  const canvas = ctx.get("mtmcanvas-client", false) as { setEnabled(enabled: boolean): Promise<void> } | undefined;
  if (canvas !== undefined) {
    const settings = ctx.settingsScope.bind<{ dynamicCanvasEnabled?: boolean }>({ namespace: "mtm-coding" });
    const reconcile = (): void => { void canvas.setEnabled(settings.getSnapshot().value?.dynamicCanvasEnabled === true); };
    ctx.effect(() => { const stop = settings.subscribe(reconcile); reconcile(); return stop; }, "mtmcanvas: settings lifecycle");
  }
}
