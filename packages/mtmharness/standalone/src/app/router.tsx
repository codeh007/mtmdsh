import { createMemoryHistory, createRootRoute, createRoute, createRouter, type AnyRouter, type RouterHistory } from "@tanstack/react-router";
import type { ClientPresentation, NormalizedClientConfig } from "@/app/config";
import { ConversationRoute } from "@/app/conversation-route";
import { WorkspaceOverview } from "@/components/full-shell";
import { EmbeddedFullShell } from "@/app/embedded-full-shell";
import { EmbeddedShell } from "@/app/embedded-shell";
import { StandaloneShell } from "@/app/standalone-shell";
import type { MtmHarnessRuntime } from "@/runtime";

export interface ClientRouterOptions {
  config: NormalizedClientConfig;
  runtime: MtmHarnessRuntime;
  presentation: ClientPresentation;
  basepath?: string;
  history?: RouterHistory;
}

export function createClientRouter({ config, runtime, presentation, basepath, history }: ClientRouterOptions): AnyRouter {
  const rootRoute = createRootRoute({
    component: presentation === "standalone"
      ? () => <StandaloneShell runtime={runtime} />
      : config.mode === "fullscreen"
        ? () => <EmbeddedFullShell runtime={runtime} />
        : () => <EmbeddedShell config={config} />,
  });
  const conversationRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => <ConversationRoute config={config} runtime={runtime} presentation={presentation} />,
  });
  const workspaceRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/workspace",
    component: () => <WorkspaceOverview runtime={runtime} />,
  });
  const routeTree = rootRoute.addChildren([conversationRoute, workspaceRoute]);
  return createRouter({
    routeTree,
    ...(basepath === undefined ? {} : { basepath }),
    history: history ?? createMemoryHistory({ initialEntries: ["/"] }),
    defaultPreload: "intent",
  });
}
