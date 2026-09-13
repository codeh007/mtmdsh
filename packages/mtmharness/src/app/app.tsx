import { RouterProvider, type AnyRouter } from "@tanstack/react-router";
import { type ReactElement, useEffect } from "react";

export interface MtmHarnessAppProps {
  router: AnyRouter;
}

/** The single React composition root shared by every browser presentation. */
export function MtmHarnessApp({ router }: MtmHarnessAppProps): ReactElement {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        void router.navigate({ to: "/p2p" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return <RouterProvider router={router} />;
}
