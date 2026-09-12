import { useSyncExternalStore, type ReactElement } from "react";
import { ConversationSurface } from "../components/conversation-surface.js";
import type { ClientPresentation, MtmHarnessPresentationController, NormalizedClientConfig } from "./config.js";
import type { MtmHarnessRuntime } from "../runtime.js";

export function ConversationRoute({ config, runtime, presentation, presentationController }: { config: NormalizedClientConfig; runtime: MtmHarnessRuntime; presentation: ClientPresentation; presentationController: MtmHarnessPresentationController }): ReactElement {
  const fullShell = useSyncExternalStore(presentationController.subscribe, presentationController.snapshot, presentationController.snapshot) === "fullscreen";
  return <ConversationSurface config={config} runtime={runtime} compact connectOnMount showHeader={!fullShell} />;
}
