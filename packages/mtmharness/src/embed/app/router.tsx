import {
  type AnyRouter,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { WorkspaceOverview } from "../components/full-shell.js";
import type { MtmHarnessRuntime } from "../runtime.js";
import type { MtmHarnessAuthClient } from "./auth.js";
import type {
  ClientPresentation,
  MtmHarnessPresentationController,
  NormalizedClientConfig,
} from "./config.js";
import { ConversationRoute } from "./conversation-route.js";
import { EmbeddedShell } from "./embedded-shell.js";

export interface ClientRouterOptions {
  config: NormalizedClientConfig;
  runtime: MtmHarnessRuntime;
  presentation: ClientPresentation;
  history?: RouterHistory;
  auth?: MtmHarnessAuthClient;
  presentationController: MtmHarnessPresentationController;
}

export function createClientRouter({
  config,
  runtime,
  presentation,
  history,
  auth,
  presentationController,
}: ClientRouterOptions): AnyRouter {
  const rootRoute = createRootRoute({
    component: () => (
      <EmbeddedShell
        config={config}
        runtime={runtime}
        auth={auth}
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
  const routeTree = rootRoute.addChildren([conversationRoute, workspaceRoute]);
  return createRouter({
    routeTree,
    history: history ?? createMemoryHistory({ initialEntries: ["/"] }),
    defaultPreload: "intent",
  });
}
