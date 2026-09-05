import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-settings";
import z from "@deepseek-ai/schemastery";
import { SETTINGS_NAMESPACE } from "./contract.ts";
export { SETTINGS_NAMESPACE } from "./contract.ts";

export interface MtmAdminSettings {
  enabled: boolean;
}

export type MtmAdminConfig = Partial<MtmAdminSettings>;

export const MtmAdminSettingsSchema: z<MtmAdminSettings> = z.object({
  enabled: z.boolean().default(false),
});

export const name = "mtm-admin";
export const inject = ["settings"];

/** Register the user-owned setting for the token-free Admin launcher. */
export function apply(ctx: Context, rawConfig: MtmAdminConfig = {}): void {
  ctx.settings.register(SETTINGS_NAMESPACE, MtmAdminSettingsSchema, { base: { enabled: rawConfig.enabled ?? false } });
}
