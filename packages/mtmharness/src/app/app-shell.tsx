import { Link, Outlet, useMatchRoute, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Maximize2,
  MessageSquare,
  Network,
  X,
} from "lucide-react";
import { type ReactElement, useSyncExternalStore } from "react";
import { Button } from "../components/ui/button.js";
import type { MtmHarnessRuntime } from "../runtime.js";
import type { MtmHarnessAuthCoordinator } from "./auth.js";
import { AuthControls } from "./auth-controls.js";
import type {
  MtmHarnessPresentationController,
  NormalizedClientConfig,
} from "./config.js";
import { DshIntegrationControl } from "./dsh-controls.js";
import { FullscreenShell } from "./fullscreen-shell.js";

export function AppShell({
  config,
  runtime,
  auth,
  dsh,
  presentationController,
}: {
  config: NormalizedClientConfig;
  runtime: MtmHarnessRuntime;
  auth?: MtmHarnessAuthCoordinator;
  dsh?: NormalizedClientConfig["dsh"];
  presentationController: MtmHarnessPresentationController;
}): ReactElement {
  const state = useSyncExternalStore(
    presentationController.subscribe,
    presentationController.snapshot,
    presentationController.snapshot,
  );
  const matchRoute = useMatchRoute();
  const router = useRouter();
  const isWorkspace = Boolean(matchRoute({ to: "/workspace" }));
  const isP2p = Boolean(matchRoute({ to: "/p2p" }));
  const navigationLabel =
    isWorkspace || isP2p ? "Open conversation" : "Open workspace";
  const navigationTo = isWorkspace || isP2p ? "/" : "/workspace";
  const NavigationIcon = isWorkspace || isP2p ? MessageSquare : LayoutDashboard;

  if (state === "fullscreen" && matchRoute({ to: "/vnc" })) {
    return (
      <main className="fixed inset-0 h-dvh w-dvw overflow-hidden bg-background">
        <Outlet />
      </main>
    );
  }
  if (state === "fullscreen") {
    return (
      <FullscreenShell
        runtime={runtime}
        auth={auth}
        dsh={dsh}
        onOpenP2p={() => router.navigate({ to: "/p2p" })}
        presentationController={presentationController}
      />
    );
  }

  if (state === "closed") {
    return (
      <div className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
        <Button
          type="button"
          size="icon-lg"
          className="rounded-full shadow-xl"
          onClick={presentationController.open}
          aria-label="Open MTM Harness conversation"
          title="Open MTM Harness conversation"
        >
          <MessageSquare />
        </Button>
      </div>
    );
  }

  const panelClass =
    config.mode === "dialog"
      ? "fixed inset-0 z-50 flex h-dvh w-dvw min-h-0 flex-col overflow-hidden border-0 bg-background shadow-2xl sm:inset-4 sm:m-auto sm:h-[min(42rem,calc(100vh-2rem))] sm:w-[min(42rem,calc(100vw-2rem))] sm:rounded-xl sm:border"
      : "fixed inset-0 z-50 flex h-dvh w-dvw min-h-0 flex-col overflow-hidden border-0 bg-background shadow-2xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(40rem,calc(100vh-2rem))] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-xl sm:border";

  return (
    <section className={panelClass} aria-label="MTM Harness conversation">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-border border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground text-xs">
            MTM
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">MTM Harness</p>
            <p className="truncate text-muted-foreground text-xs">
              {isWorkspace ? "Workspace" : "DSH conversation"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <AuthControls auth={auth} />
          <DshIntegrationControl
            bridge={dsh}
            onOpenP2p={() => router.navigate({ to: "/p2p" })}
          />
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Open full workspace"
            title="Open full workspace"
            onClick={presentationController.openFullShell}
          >
            <Maximize2 />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            nativeButton={false}
            render={<Link to={navigationTo} />}
            aria-label={navigationLabel}
            title={navigationLabel}
          >
            <NavigationIcon />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            nativeButton={false}
            render={<Link to={isP2p ? "/" : "/p2p"} />}
            aria-label={isP2p ? "Open conversation" : "Open P2P node"}
            title={isP2p ? "Open conversation" : "Open P2P node"}
          >
            <Network />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Close conversation"
            title="Close conversation"
            onClick={presentationController.close}
          >
            <X />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </section>
  );
}
