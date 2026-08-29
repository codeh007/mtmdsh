import type { Context } from "@deepseek-ai/cordis";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { SETTINGS_NAMESPACE } from "./contract.ts";
export { SETTINGS_NAMESPACE } from "./contract.ts";

export interface MtmConnectSettings {
  enabled: boolean;
}

export type MtmConnectConfig = Partial<MtmConnectSettings>;

export const MtmConnectSettingsSchema: z<MtmConnectSettings> = z.object({
  enabled: z.boolean().default(true),
});

export const name = "mtm-connect";
export const inject = ["settings"];

/** Register the user-owned setting for the secondary Connect frontend. */
export function apply(ctx: Context, rawConfig: MtmConnectConfig = {}): void {
  ctx.settings.register(settingsNamespace(SETTINGS_NAMESPACE), MtmConnectSettingsSchema, { base: { enabled: rawConfig.enabled ?? true } });
}
