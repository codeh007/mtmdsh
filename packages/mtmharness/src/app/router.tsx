import {
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  type RouterHistory,
} from "@tanstack/react-router";
import { Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { WorkspaceOverview } from "../components/full-shell.js";
import type { MtmP2pClient } from "../features/p2p/client.js";
import type { MtmHarnessDshIntegrationBridge } from "../host/contract.js";
import type { MtmHarnessRuntime } from "../runtime.js";
import { validateReturnTarget, type MtmHarnessAuthCoordinator } from "./auth.js";
import type { ClientPresentation, MtmHarnessPresentationController, NormalizedClientConfig } from "./config.js";
import { ConversationRoute } from "./conversation-route.js";
import { AppShell } from "./app-shell.js";
import { P2pDebugView } from "./p2p-route.js";

export interface RouterContext { auth: MtmHarnessAuthCoordinator; }
export interface ClientRouterOptions {
  config: NormalizedClientConfig;
  runtime: MtmHarnessRuntime;
  presentation: ClientPresentation;
  history?: RouterHistory;
  auth: MtmHarnessAuthCoordinator;
  dsh?: MtmHarnessDshIntegrationBridge;
  p2p: MtmP2pClient;
  p2pBootstrapAddress?: string;
  presentationController: MtmHarnessPresentationController;
}

function internalTarget(pathname: string, search: string): string {
  try { return validateReturnTarget(pathname + search); } catch { return "/"; }
}

function LoginView({ auth }: { auth: MtmHarnessAuthCoordinator }): ReactElement {
  const location = useRouterState({ select: (state) => state.location });
  const target = internalTarget(location.pathname, location.searchStr);
  return <main className="grid min-h-full place-items-center p-6"><div className="w-full max-w-sm space-y-4 rounded-lg border bg-card p-6 shadow-sm"><h1 className="font-semibold text-lg">Sign in to MTM Harness</h1><p className="text-muted-foreground text-sm">Authentication is required to continue.</p><button className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm" type="button" disabled={!auth.interactiveLogin} onClick={() => void auth.beginLogin({ returnTarget: target })}>{auth.interactiveLogin ? "Sign in" : "Authentication unavailable"}</button></div></main>;
}

function UnavailableView({ auth }: { auth: MtmHarnessAuthCoordinator }): ReactElement {
  const message = auth.getSnapshot().error ?? "Authentication is unavailable.";
  return <main className="grid min-h-full place-items-center p-6"><div className="w-full max-w-sm space-y-3 rounded-lg border border-destructive/40 bg-card p-6"><h1 className="font-semibold text-lg">Authentication unavailable</h1><p className="text-muted-foreground text-sm">{message}</p></div></main>;
}

export function createClientRouter(options: ClientRouterOptions) {
  const { config, runtime, presentation, history, auth, dsh, p2p, p2pBootstrapAddress, presentationController } = options;
  const rootRoute = createRootRouteWithContext<RouterContext>()({ component: () => <AppShell config={config} runtime={runtime} auth={auth} dsh={dsh} presentationController={presentationController} /> });
  const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: "/login", validateSearch: (search: Record<string, unknown>) => { try { return { returnTo: validateReturnTarget(typeof search.returnTo === "string" ? search.returnTo : undefined) }; } catch { return { returnTo: "/" }; } }, component: () => <LoginView auth={auth} /> });
  const unavailableRoute = createRoute({ getParentRoute: () => rootRoute, path: "/unavailable", component: () => <UnavailableView auth={auth} /> });
  const authenticatedRoute = createRoute({ getParentRoute: () => rootRoute, id: "authenticated", beforeLoad: async ({ location }) => { await auth.ready; const status = auth.getSnapshot().status; if (status === "authenticated") return; if (status === "error" || status === "unavailable") throw redirect({ to: "/unavailable" }); throw redirect({ to: "/login", search: { returnTo: internalTarget(location.pathname, location.searchStr) } }); }, component: () => <Outlet /> });
  const conversationRoute = createRoute({ getParentRoute: () => authenticatedRoute, path: "/", component: () => <ConversationRoute config={config} runtime={runtime} presentationController={presentationController} /> });
  const workspaceRoute = createRoute({ getParentRoute: () => authenticatedRoute, path: "/workspace", component: () => <WorkspaceOverview runtime={runtime} /> });
  const p2pRoute = createRoute({ getParentRoute: () => rootRoute, path: "/p2p", component: () => <P2pDebugView client={p2p} bootstrapAddress={p2pBootstrapAddress} wide={config.mode === "fullscreen"} /> });
  const routeTree = rootRoute.addChildren([loginRoute, unavailableRoute, authenticatedRoute.addChildren([conversationRoute, workspaceRoute]), p2pRoute]);
  return createRouter({ routeTree, context: { auth }, history: history ?? createMemoryHistory({ initialEntries: ["/"] }), defaultPreload: "intent" });
}
