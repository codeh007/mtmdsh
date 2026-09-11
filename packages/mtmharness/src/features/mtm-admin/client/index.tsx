import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type { MtmAdminClient } from "mtm-admin";
import { MtmAdminCard } from "./MtmAdminCard.js";
import { MtmAdminCardController } from "./controller.js";
import { en, zh, type MtmAdminLocaleKey } from "./locales.js";
import { SETTINGS_NAMESPACE } from "../contract.js";
import type { MtmAdminSettings } from "../index.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "mtm.admin": MtmAdminLocaleKey;
  }
}

export const name = "mtm-admin-client";
export const inject = ["slots", "locale", "settingsScope"];

/** Register the Admin launcher settings card for the composed client. */
export function apply(ctx: ClientContext): void {
  const settings = ctx.settingsScope.bind<MtmAdminSettings>({ namespace: SETTINGS_NAMESPACE });
  const runtime = ctx.get("mtm-admin-client", false) as MtmAdminClient | undefined;
  if (runtime === undefined) throw new Error("mtm-admin: composed client is unavailable");
  const controller = new MtmAdminCardController(settings, runtime);
  ctx.effect(() => async () => { await controller.dispose(); }, "mtm-admin: client lifecycle");
  const t = ctx.locale.bind("mtm.admin");
  ctx.effect(() => ctx.locale.register("mtm.admin", { en, zh }), "mtm-admin: locale");
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: SETTINGS_NAMESPACE,
    locale: "mtm.admin",
    inject: () => controller.inject(),
  }, (props) => <MtmAdminCard {...props} t={t} />));
}
