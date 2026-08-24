import type { ReactElement } from "react";
import { ConversationSurface } from "@/components/conversation-surface";
import type { ClientPresentation, NormalizedClientConfig } from "@/app/config";
import type { MtmHarnessRuntime } from "@/runtime";

export function ConversationRoute({ config, runtime, presentation }: { config: NormalizedClientConfig; runtime: MtmHarnessRuntime; presentation: ClientPresentation }): ReactElement {
  return <ConversationSurface config={config} runtime={runtime} compact connectOnMount showHeader={presentation !== "standalone" && config.mode !== "fullscreen"} />;
}
