import { Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FullShellFrame } from "@/components/full-shell";
import type { MtmHarnessAuthClient } from "@/app/auth";
import type { MtmHarnessRuntime } from "@/runtime";

export function StandaloneShell({ runtime, auth }: { runtime: MtmHarnessRuntime; auth?: MtmHarnessAuthClient }): ReactElement {
  return <FullShellFrame runtime={runtime} auth={auth}><Outlet /></FullShellFrame>;
}
