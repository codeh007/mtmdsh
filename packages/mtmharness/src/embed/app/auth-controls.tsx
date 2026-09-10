import { LogIn, LogOut, RefreshCcw, UserRound } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import type { MtmHarnessAuthClient, MtmHarnessAuthSnapshot } from "./auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useAuthSnapshot(auth: MtmHarnessAuthClient): MtmHarnessAuthSnapshot {
  const [snapshot, setSnapshot] = useState(() => auth.getSnapshot());
  useEffect(() => {
    setSnapshot(auth.getSnapshot());
    return auth.subscribe(setSnapshot);
  }, [auth]);
  return snapshot;
}

function redirectToAuthorization(url: string): void {
  window.location.assign(url);
}

export function AuthControls({ auth }: { auth?: MtmHarnessAuthClient }): ReactElement | null {
  if (auth === undefined) return null;
  return <AuthControlsView auth={auth} />;
}

function AuthControlsView({ auth }: { auth: MtmHarnessAuthClient }): ReactElement {
  const snapshot = useAuthSnapshot(auth);
  const [busy, setBusy] = useState(false);

  async function signIn(selectAccount = false): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const authorizationUrl = await (selectAccount ? auth.switchAccount() : auth.beginLogin());
      auth.dispose({ preserveAuthorization: true });
      redirectToAuthorization(authorizationUrl);
    } catch {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      await auth.logout();
    } catch {
      // Keep the local signed-out state even when revocation is unavailable.
    } finally {
      setBusy(false);
    }
  }

  if (snapshot.status === "authenticated") {
    return (
      <div className="flex shrink-0 items-center gap-1" data-auth-status="authenticated">
        <span className="hidden items-center gap-1 text-muted-foreground text-xs sm:flex" title="Authenticated account">
          <UserRound className="size-3.5" aria-hidden="true" />
          Signed in
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Switch account" title="Switch account" disabled={busy} onClick={() => void signIn(true)}>
          <RefreshCcw />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Sign out" title="Sign out" disabled={busy} onClick={() => void signOut()}>
          <LogOut />
        </Button>
      </div>
    );
  }

  const pending = busy || snapshot.status === "discovering" || snapshot.status === "authorizing";
  return (
    <div className={cn("flex shrink-0 items-center gap-2", snapshot.status === "error" && "text-destructive")} data-auth-status={snapshot.status}>
      {snapshot.status === "error" ? <span className="hidden max-w-48 truncate text-xs sm:block" role="alert">{snapshot.error ?? "Authentication unavailable"}</span> : null}
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => void signIn()}>
        <LogIn data-icon="inline-start" />
        {pending ? "Connecting" : "Sign in"}
      </Button>
    </div>
  );
}
