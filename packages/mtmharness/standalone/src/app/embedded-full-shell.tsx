import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "@/components/full-shell";
import type { MtmHarnessAuthClient } from "@/app/auth";
import type { MtmHarnessRuntime } from "@/runtime";

export function EmbeddedFullShell({ runtime, auth }: { runtime: MtmHarnessRuntime; auth?: MtmHarnessAuthClient }): ReactElement {
  return (
    <div className="fixed inset-0 z-[2147483647] h-dvh w-dvw overflow-hidden bg-background">
      <FullShellFrame runtime={runtime} auth={auth}><Outlet /></FullShellFrame>
    </div>
  );
}
