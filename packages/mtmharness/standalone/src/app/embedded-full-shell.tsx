import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "@/components/full-shell";
import type { MtmHarnessRuntime } from "@/runtime";

export function EmbeddedFullShell({ runtime }: { runtime: MtmHarnessRuntime }): ReactElement {
  return (
    <div className="fixed inset-0 z-[2147483647] h-dvh w-dvw overflow-hidden bg-background">
      <FullShellFrame runtime={runtime}><Outlet /></FullShellFrame>
    </div>
  );
}
