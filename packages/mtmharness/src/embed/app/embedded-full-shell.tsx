import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "../components/full-shell.js";
import type { MtmHarnessRuntime } from "../runtime.js";
import type { MtmHarnessAuthClient } from "./auth.js";
import type { MtmHarnessPresentationController } from "./config.js";

export function EmbeddedFullShell({
  runtime,
  auth,
  presentationController,
}: {
  runtime: MtmHarnessRuntime;
  auth?: MtmHarnessAuthClient;
  presentationController: MtmHarnessPresentationController;
}): ReactElement {
  return (
    <div className="fixed inset-0 z-50 h-dvh w-dvw overflow-hidden bg-background">
      <FullShellFrame
        runtime={runtime}
        auth={auth}
        onClose={presentationController.close}
      >
        <Outlet />
      </FullShellFrame>
    </div>
  );
}
