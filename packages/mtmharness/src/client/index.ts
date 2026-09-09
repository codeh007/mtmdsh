/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { apply as applyCoding } from "../features/coding/client/index.tsx";
import { apply as applyMtmConnect } from "../features/mtm-connect/client/index.tsx";
import { apply as applyMtmAdmin } from "../features/mtm-admin/client/index.tsx";
import { apply as applySecondary } from "../features/secondary/client.ts";
import { mount as mountMtmP2p } from "mtm-p2p";

export { applyCoding };
export const inject = ["slots", "locale", "settingsScope", "connection"];

/** Register coding and secondary features under one plugin-owned lifecycle. */
export function apply(ctx: ClientContext): void {
  applyCoding(ctx);
  applyMtmConnect(ctx);
  applyMtmAdmin(ctx);
  applySecondary(ctx);
  if (typeof document !== "undefined") {
    const root = document.createElement("div");
    document.body.append(root);
    const cleanup = mountMtmP2p({
      root,
      signal: new AbortController().signal,
      registerCleanup: (fn: () => void) =>
        ctx.effect(() => fn, "mtm-p2p: client lifecycle"),
    });
    ctx.effect(() => cleanup, "mtm-p2p: dispose");
  }
}
