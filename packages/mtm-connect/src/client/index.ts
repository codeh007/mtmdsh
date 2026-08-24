import { createElement } from "react";
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { MtmConnectAction } from "./MtmConnectAction.tsx";
import { createMtmConnectTransport, MtmConnectClientRuntime } from "./runtime.ts";
import { MTM_CONNECT_CSS } from "./styles.ts";

export type { MtmConnectClientActions, MtmConnectViewState } from "./runtime.ts";
export { MtmConnectClientRuntime } from "./runtime.ts";
export { MtmConnectAction } from "./MtmConnectAction.tsx";

export const inject = ["slots", "connection"];

declare module "@deepseek-ai/cordis" {
  interface Context {
    mtmConnectClient: MtmConnectClientRuntime;
  }
}

/** Mount the browser control surface and keep its fixture registry fiber-scoped. */
export function apply(ctx: ClientContext): void {
  const connection = ctx.get("connection") as unknown as ConnectionHandle | undefined;
  if (connection === undefined) throw new Error("mtm-connect: DSH connection service is unavailable");
  const runtime = new MtmConnectClientRuntime({ transport: createMtmConnectTransport(connection.rpc) });
  ctx.provide("mtmConnectClient", runtime);
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
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtm-connect",
    order: 20,
  }, (props: PropsRuntime<"sidebar.footer.action">) => createElement(MtmConnectAction, { ...props, runtime })));
}
