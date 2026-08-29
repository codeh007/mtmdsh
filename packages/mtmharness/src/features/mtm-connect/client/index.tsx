import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type {} from "@deepseek-ai/dsh-client-locale/client";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";
import { MtmConnectCard } from "./MtmConnectCard.js";
import { MtmConnectCardController } from "./controller.js";
import { en, zh, type MtmConnectLocaleKey } from "./locales.js";
import { MtmSecondaryClientRuntime } from "../../secondary/client.js";
import { MTM_CONNECT_EXTENSION } from "../../secondary/manifest.js";
import { SETTINGS_NAMESPACE } from "../contract.js";
import type { MtmConnectSettings } from "../index.js";

declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    "mtm.connect": MtmConnectLocaleKey;
  }
}

export const name = "mtm-connect-client";
export const inject = ["slots", "locale", "settingsScope"];

/** Register the settings card and runtime-loaded Connect frontend. */
export function apply(ctx: ClientContext): void {
  const settings = ctx.settingsScope.bind<MtmConnectSettings>({ namespace: SETTINGS_NAMESPACE });
  const runtime = new MtmSecondaryClientRuntime({ document: typeof document === "undefined" ? undefined : document }, MTM_CONNECT_EXTENSION);
  const controller = new MtmConnectCardController(settings, runtime);
  const t = ctx.locale.bind("mtm.connect");
  ctx.effect(() => ctx.locale.register("mtm.connect", { en, zh }), "mtm-connect: locale");
  ctx.slots.inject("settings.plugin.item", () => ctx.slots.register({
    name: "settings.plugin.item",
    key: SETTINGS_NAMESPACE,
    locale: "mtm.connect",
    inject: () => controller.inject(),
  }, (props) => <MtmConnectCard {...props} t={t} />));
  ctx.effect(() => async () => { await controller.dispose(); }, "mtm-connect: client lifecycle");
}
