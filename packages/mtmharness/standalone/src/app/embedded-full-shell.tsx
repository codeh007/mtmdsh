import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "@/components/full-shell";
import type { MtmHarnessAuthClient } from "@/app/auth";
import type { MtmHarnessRuntime } from "@/runtime";
import type { MtmHarnessPresentationController } from "@/app/config";

export function EmbeddedFullShell({ runtime, auth, presentationController }: { runtime: MtmHarnessRuntime; auth?: MtmHarnessAuthClient; presentationController: MtmHarnessPresentationController }): ReactElement {
  return (
    <div className="fixed inset-0 z-[2147483647] h-dvh w-dvw overflow-hidden bg-background">
      <FullShellFrame runtime={runtime} auth={auth} onClose={presentationController.close}><Outlet /></FullShellFrame>
    </div>
  );
}
