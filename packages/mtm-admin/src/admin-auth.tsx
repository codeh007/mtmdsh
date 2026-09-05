"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { AdminAuthClient } from "./config";
import { useTranslations } from "./i18n";
import { AdminControlPlaneSurface } from "./components/admin/admin-control-plane-surface";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";

type AuthGateProps = { auth: AdminAuthClient };

export function AdminAuthGate({ auth }: AuthGateProps) {
  const snapshot = useSyncExternalStore(
    (listener) => auth.subscribe(() => listener()),
    () => auth.getSnapshot(),
    () => auth.getSnapshot(),
  );
  const [signingIn, setSigningIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const t = useTranslations("admin.auth");

  useEffect(() => {
    void auth.consumeCallback().catch(() => undefined);
  }, [auth]);

  if (snapshot.status === "authenticated") return <AdminControlPlaneSurface />;

  async function signIn(): Promise<void> {
    setSigningIn(true);
    setLoginError(null);
    try {
      window.location.assign(await auth.beginLogin());
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : t("authenticationFailed"));
      setSigningIn(false);
    }
  }

  const busy = signingIn || snapshot.status === "authorizing" || snapshot.status === "discovering";
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {snapshot.status === "error" || loginError ? (
            <p className="text-sm text-destructive" role="alert">{loginError ?? snapshot.error ?? t("authenticationFailed")}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("authenticationRequired")}</p>
          )}
          <Button disabled={busy} onClick={() => void signIn()} type="button">
            {busy ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <LogIn data-icon="inline-start" />}
            {busy ? t("signingIn") : t("signIn")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
