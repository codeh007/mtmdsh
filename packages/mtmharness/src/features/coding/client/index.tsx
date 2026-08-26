import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { MtmCodingCard } from "./MtmCodingCard.js";
import { MtmCodingCardController, SETTINGS_NAMESPACE } from "./controller.js";
import { en, zh } from "./locales.js";
import type { MtmCodingLocaleKey } from "./locales.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "mtm.coding": MtmCodingLocaleKey;
  }
}

export const name = "mtm-coding-client";
export const inject = ["slots", "locale", "settingsScope"];

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind("mtm.coding");
  ctx.effect(() => ctx.locale.register("mtm.coding", { en, zh }), "mtm-coding: locale");
  const controller = new MtmCodingCardController(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }));
  ctx.effect(() => () => { controller.dispose(); }, "mtm-coding: settings card");
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: SETTINGS_NAMESPACE,
    locale: "mtm.coding",
    inject: () => controller.inject(),
  }, (props) => <MtmCodingCard {...props} t={t} />));
}
