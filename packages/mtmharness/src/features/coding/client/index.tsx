import type { ConnectionHandle } from "@deepseek-ai/dsh-client-connection/client";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
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
export const inject = ["slots", "locale", "settingsScope", "connection"];

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind("mtm.coding");
  ctx.effect(() => ctx.locale.register("mtm.coding", { en, zh }), "mtm-coding: locale");
  const connection = typeof ctx.get === "function" ? ctx.get("connection") as ConnectionHandle | undefined : undefined;
  const updateRpc = connection?.isLoopback === true ? connection.rpc : undefined;
  const controller = new MtmCodingCardController(ctx.settingsScope.bind({ namespace: SETTINGS_NAMESPACE }), updateRpc);
  ctx.effect(() => () => { controller.dispose(); }, "mtm-coding: settings card");
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: SETTINGS_NAMESPACE,
    locale: "mtm.coding",
    inject: () => controller.inject(),
  }, (props) => <MtmCodingCard {...props} t={t} />));
}
