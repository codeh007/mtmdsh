import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "../components/full-shell.js";
import type { MtmHarnessRuntime } from "../runtime.js";
import type { MtmHarnessAuthCoordinator } from "./auth.js";
import type { MtmHarnessPresentationController } from "./config.js";

export function FullscreenShell({
  runtime,
  auth,
  dsh,
  onOpenP2p,
  presentationController,
}: {
  runtime: MtmHarnessRuntime;
  auth?: MtmHarnessAuthCoordinator;
  dsh?: import("../host/contract.js").MtmHarnessDshIntegrationBridge;
  onOpenP2p?: () => Promise<void>;
  presentationController: MtmHarnessPresentationController;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden bg-background">
      <FullShellFrame
        runtime={runtime}
        auth={auth}
        dsh={dsh}
        onOpenP2p={onOpenP2p}
        onClose={presentationController.close}
      >
        <Outlet />
      </FullShellFrame>
    </div>
  );
}
