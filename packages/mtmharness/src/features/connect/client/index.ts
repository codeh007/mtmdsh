import type { Context } from "@deepseek-ai/cordis";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import { createMtmConnectTransport, MtmConnectClientRuntime } from "./runtime.ts";
import { MTM_CONNECT_CSS } from "./styles.ts";

/** Mount the browser connection runtime and its scoped styles. */
export function apply(ctx: Context): MtmConnectClientRuntime {
  const connection = ctx.get("connection") as ConnectionHandle | undefined;
  if (connection === undefined) throw new Error("mtm-connect: DSH connection service is unavailable");
  const runtime = new MtmConnectClientRuntime({ transport: createMtmConnectTransport(connection.rpc) });
  ctx.effect(() => () => { runtime.dispose(); }, "mtm-connect: client runtime");
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {};
    const style = document.createElement("style");
    style.dataset.plugin = "mtm-connect";
    style.dataset.pluginCss = "mtm-connect/inline.css";
    style.textContent = MTM_CONNECT_CSS;
    document.head.append(style);
    return () => { style.remove(); };
  }, "mtm-connect: styles");
  return runtime;
}
