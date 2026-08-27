import { Link, Outlet, useMatchRoute } from "@tanstack/react-router";
import { LayoutDashboard, Maximize2, MessageSquare, X } from "lucide-react";
import { useSyncExternalStore, type ReactElement } from "react";
import { Button } from "@/components/ui/button";
import type { MtmHarnessPresentationController, NormalizedClientConfig } from "@/app/config";
import type { MtmHarnessAuthClient } from "@/app/auth";
import { AuthControls } from "@/app/auth-controls";
import { EmbeddedFullShell } from "@/app/embedded-full-shell";
import type { MtmHarnessRuntime } from "@/runtime";

export function EmbeddedShell({ config, runtime, auth, presentationController }: { config: NormalizedClientConfig; runtime: MtmHarnessRuntime; auth?: MtmHarnessAuthClient; presentationController: MtmHarnessPresentationController }): ReactElement {
  const state = useSyncExternalStore(presentationController.subscribe, presentationController.snapshot, presentationController.snapshot);
  const matchRoute = useMatchRoute();
  const isWorkspace = Boolean(matchRoute({ to: "/workspace" }));
  const navigationLabel = isWorkspace ? "Open conversation" : "Open workspace";
  const NavigationIcon = isWorkspace ? MessageSquare : LayoutDashboard;

  if (state === "fullscreen") {
    return <EmbeddedFullShell runtime={runtime} auth={auth} presentationController={presentationController} />;
  }

  if (state === "closed") {
    return (
      <div className="fixed right-4 bottom-4 z-[2147483647] sm:right-6 sm:bottom-6">
        <Button type="button" size="icon-lg" className="rounded-full shadow-xl" onClick={presentationController.open} aria-label="Open MTM Harness conversation" title="Open MTM Harness conversation">
          <MessageSquare />
        </Button>
      </div>
    );
  }

  const panelClass = config.mode === "dialog"
    ? "fixed inset-0 z-[2147483647] flex h-dvh w-dvw min-h-0 flex-col overflow-hidden border-0 bg-background shadow-2xl sm:inset-4 sm:m-auto sm:h-[min(42rem,calc(100vh-2rem))] sm:w-[min(42rem,calc(100vw-2rem))] sm:rounded-xl sm:border"
    : "fixed inset-0 z-[2147483647] flex h-dvh w-dvw min-h-0 flex-col overflow-hidden border-0 bg-background shadow-2xl sm:inset-auto sm:right-6 sm:bottom-6 sm:h-[min(40rem,calc(100vh-2rem))] sm:w-[min(28rem,calc(100vw-2rem))] sm:rounded-xl sm:border";

  return (
    <section className={panelClass} aria-label="MTM Harness conversation">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-border border-b bg-card px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground text-xs">MTM</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm">MTM Harness</p>
            <p className="truncate text-muted-foreground text-xs">{isWorkspace ? "Workspace" : "DSH conversation"}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <AuthControls auth={auth} />
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Open full workspace" title="Open full workspace" onClick={presentationController.openFullShell}>
            <Maximize2 />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" nativeButton={false} render={<Link to={isWorkspace ? "/" : "/workspace"} />} aria-label={navigationLabel} title={navigationLabel}>
            <NavigationIcon />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Close conversation" title="Close conversation" onClick={presentationController.close}>
            <X />
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col"><Outlet /></div>
    </section>
  );
}
