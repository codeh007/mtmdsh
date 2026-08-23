/** Minimal official DSH Web client plugin surface for MTM Harness. */
import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { MtmHarnessAction } from "./MtmHarnessAction.tsx";

export const inject = ["slots"];

/** Register one additive sidebar action and let its fiber own teardown. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
    name: "sidebar.footer.action",
    id: "mtmharness",
    order: 10,
  }, MtmHarnessAction));
}
