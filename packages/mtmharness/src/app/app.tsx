import { RouterProvider, type AnyRouter } from "@tanstack/react-router";
import { type ReactElement, useEffect, useSyncExternalStore } from "react";
import type { MtmHarnessAuthCoordinator } from "./auth.js";

export interface MtmHarnessAppProps {
  router: AnyRouter;
  auth: MtmHarnessAuthCoordinator;
}

export function MtmHarnessApp({ router, auth }: MtmHarnessAppProps): ReactElement {
  const snapshot = useSyncExternalStore(
    (listener) => auth.subscribe(listener),
    () => auth.getSnapshot(),
    () => auth.getSnapshot(),
  );
  useEffect(() => { void router.invalidate(); }, [router, snapshot]);
  return <RouterProvider router={router} context={{ auth }} />;
}
