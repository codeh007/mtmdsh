/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { apply as applyConnect } from "../features/connect/client/index.ts";
import { MtmHarnessAction } from "./MtmHarnessAction.tsx";

export const inject = ["slots", "sessions", "connection"];

/** Register every MTM feature under one plugin-owned lifecycle. */
export function apply(ctx: ClientContext): void {
  if (ctx.get("connection") === undefined) throw new Error("mtmharness: DSH connection service is unavailable");
  applyConnect(ctx);
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtmharness",
    order: 10,
  }, MtmHarnessAction));
}
