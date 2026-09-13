import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { WorkspaceOverview } from "../components/full-shell.js";
import type { MtmP2pClient } from "../features/p2p/client.js";
import type { MtmHarnessDshIntegrationBridge } from "../host/contract.js";
import type { MtmHarnessRuntime } from "../runtime.js";
import type { MtmHarnessAuthClient } from "./auth.js";
import type {
  ClientPresentation,
  MtmHarnessPresentationController,
  NormalizedClientConfig,
} from "./config.js";
import { ConversationRoute } from "./conversation-route.js";
import { EmbeddedShell } from "./embedded-shell.js";
import { P2pDebugView } from "./p2p-route.js";

export interface ClientRouterOptions {
  config: NormalizedClientConfig;
  runtime: MtmHarnessRuntime;
  presentation: ClientPresentation;
  history?: RouterHistory;
  auth?: MtmHarnessAuthClient;
  dsh?: MtmHarnessDshIntegrationBridge;
  p2p: MtmP2pClient;
  p2pBootstrapAddress?: string;
  presentationController: MtmHarnessPresentationController;
}

export function createClientRouter({
  config,
  runtime,
  presentation,
  history,
  auth,
  dsh,
  p2p,
  p2pBootstrapAddress,
  presentationController,
}: ClientRouterOptions): AnyRouter {
  const rootRoute = createRootRoute({
    component: () => (
      <EmbeddedShell
        config={config}
        runtime={runtime}
        auth={auth}
        dsh={dsh}
        presentationController={presentationController}
      />
    ),
  });
  const conversationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <ConversationRoute
        config={config}
        runtime={runtime}
        presentation={presentation}
        presentationController={presentationController}
      />
    ),
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspace",
    component: () => <WorkspaceOverview runtime={runtime} />,
  });
  const p2pRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p2p",
    component: () => (
      <P2pDebugView
        client={p2p}
        bootstrapAddress={p2pBootstrapAddress}
        wide={config.mode === "fullscreen"}
      />
    ),
  });
  const routeTree = rootRoute.addChildren([
    conversationRoute,
    workspaceRoute,
    p2pRoute,
  ]);
  return createRouter({
    routeTree,
    history: history ?? createMemoryHistory({ initialEntries: ["/"] }),
    defaultPreload: "intent",
  });
}
