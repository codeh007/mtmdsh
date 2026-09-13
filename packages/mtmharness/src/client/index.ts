/** Assemble the MTM Harness client domains into one DSH plugin entry. */
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { apply as applyCoding } from "../features/coding/client/index.js";
import { apply as applyMtmP2p } from "../features/p2p/client.js";

export { applyCoding };
export const inject = ["slots", "locale", "settingsScope", "connection"];

/** Compose all MTM client packages under the mtmharness Cordis fiber. */
export async function apply(ctx: ClientContext): Promise<void> {
  applyMtmP2p(ctx);
  applyCoding(ctx);
}
