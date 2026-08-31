/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { apply as applyCoding } from "../features/coding/client/index.tsx";
import { apply as applyMtmConnect } from "../features/mtm-connect/client/index.tsx";
import { apply as applySecondary } from "../features/secondary/client.ts";

export { applyCoding };
export const inject = ["slots", "locale", "settingsScope"];

/** Register coding and secondary features under one plugin-owned lifecycle. */
export function apply(ctx: ClientContext): void {
  applyCoding(ctx);
  applyMtmConnect(ctx);
  applySecondary(ctx);
}
