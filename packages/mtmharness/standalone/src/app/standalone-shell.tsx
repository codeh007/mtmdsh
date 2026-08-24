import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "@/components/full-shell";
import type { MtmHarnessRuntime } from "@/runtime";

export function StandaloneShell({ runtime }: { runtime: MtmHarnessRuntime }): ReactElement {
  return <FullShellFrame runtime={runtime}><Outlet /></FullShellFrame>;
}
