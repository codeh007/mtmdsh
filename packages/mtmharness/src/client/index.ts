/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { apply as applyCoding } from "../features/coding/client/index.tsx";
import { apply as applyConnect } from "../features/connect/client/index.ts";
import { apply as applyCanvas } from "../features/canvas/client/index.ts";
import type { MtmConnectPanelActions } from "../features/connect/client/MtmConnectPanel.tsx";
import { MtmHarnessAction, type MtmHarnessActionInjected } from "./MtmHarnessAction.tsx";
import { MtmCanvasAction } from "./MtmCanvasAction.tsx";

export { applyCoding };
export const inject = ["slots", "sessions", "connection", "locale", "settingsScope"];

/** Register every MTM and coding feature under one plugin-owned lifecycle. */
export function apply(ctx: ClientContext): void {
  if (ctx.get("connection") === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyCoding(ctx);
  const runtime = applyConnect(ctx);
  const canvasRuntime = applyCanvas(ctx);
  const actions: MtmConnectPanelActions = {
    selectConnection: (connectionId) => { runtime.selectConnection(connectionId); },
    refresh: () => { runtime.refresh(); },
    createMockConnection: () => { runtime.createMockConnection(); },
    enableSelected: () => { runtime.enableSelected(); },
    disableSelected: () => { runtime.disableSelected(); },
    revokeSelected: () => { runtime.revokeSelected(); },
    reconnectSelected: () => { runtime.reconnectSelected(); },
    setCapabilityEnabled: (capabilityId, enabled) => { runtime.setCapabilityEnabled(capabilityId, enabled); },
    setModelInvocable: (capabilityId, enabled) => { runtime.setModelInvocable(capabilityId, enabled); },
    setUserInvocable: (capabilityId, enabled) => { runtime.setUserInvocable(capabilityId, enabled); },
    setEventPolicy: (capabilityId, policy) => { runtime.setEventPolicy(capabilityId, policy); },
  };
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtmharness",
    order: 10,
    inject: (): MtmHarnessActionInjected => ({ actions, hooks: { connect: runtime } }),
  }, MtmHarnessAction));
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtmcanvas",
    order: 11,
    inject: () => ({ actions: canvasRuntime, hooks: { canvas: canvasRuntime } }),
  }, MtmCanvasAction));
}
