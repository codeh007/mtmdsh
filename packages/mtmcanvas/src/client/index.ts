import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import { MtmCanvasAction } from "./MtmCanvasAction.tsx";
import { CanvasRuntime } from "./runtime.ts";
import { MTM_CANVAS_CSS } from "./styles.ts";

/** Mount the browser Canvas runtime and its plugin-owned styles. */
export const inject = ["slots", "connection"];

export function apply(ctx: ClientContext): void {
  const connection = ctx.get("connection") as ConnectionHandle | undefined;
  if (connection === undefined) throw new Error("mtm-canvas: DSH connection service is unavailable");
  const runtime = new CanvasRuntime(connection.rpc);
  ctx.effect(() => () => { runtime.dispose(); }, "mtm-canvas: client runtime");
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {};
    const style = document.createElement("style");
    style.dataset.plugin = "mtm-canvas";
    style.textContent = MTM_CANVAS_CSS;
    document.head.append(style);
    return () => { style.remove(); };
  }, "mtm-canvas: styles");
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtmcanvas",
    order: 11,
    inject: () => ({ actions: runtime, hooks: { canvas: runtime } }),
  }, MtmCanvasAction));
}
