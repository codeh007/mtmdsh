import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import { CanvasRuntime } from "./runtime.ts";
import { MTM_CANVAS_CSS } from "./styles.ts";

/** Mount the browser Canvas runtime and its plugin-owned styles. */
export function apply(ctx: Context): CanvasRuntime {
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
  return runtime;
}
