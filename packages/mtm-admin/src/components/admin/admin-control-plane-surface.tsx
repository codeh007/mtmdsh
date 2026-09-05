"use client";

import { adminAuth, adminFetch } from "../../admin-fetch";
import { LoaderCircle, LogOut, Save, ShieldCheck } from "lucide-react";
import { useTranslations } from "../../i18n";
import { useEffect, useState } from "react";
import { P2PBootstrapSurface } from "./p2p-bootstrap-surface";
import { SystemConfigSurface } from "../system-config/system-config-surface";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { translateApiError } from "../../lib/i18n/api-error";

type AuthConfig = {
  emailVerificationAvailable: boolean;
  emailVerificationEnabled: boolean;
  github: { clientId: string; enabled: boolean; secretConfigured: boolean };
  memberSignupEnabled: boolean;
};

type Message = { kind: "error" | "success"; text: string };

type AuthConfigResponse = {
  config?: AuthConfig;
  error?: { code?: string; message?: string };
};

const controlPlaneErrorKeys = {
  auth_config_invalid: "authConfigInvalid",
  auth_config_unavailable: "authConfigUnavailable",
  auth_email_delivery_unavailable: "emailDeliveryUnavailable",
  platform_admin_required: "platformAdminRequired",
  system_config_auth_required: "authRequired",
  system_config_auth_unavailable: "authUnavailable",
  system_config_scope_required: "scopeRequired",
} as const;

async function signOut() {
  await adminAuth()?.logout();
}

export function AdminControlPlaneSurface() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [githubSecret, setGithubSecret] = useState("");
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const t = useTranslations("admin.controlPlane");
  const tErrors = useTranslations("admin.controlPlane.errors");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await adminFetch("/api/system/auth", { headers: { accept: "application/json" } });
        const body = (await response.json()) as AuthConfigResponse;
        if (!response.ok || !body.config)
          throw new Error(translateApiError(body, tErrors("authConfigUnavailable"), controlPlaneErrorKeys, tErrors));
        if (!cancelled) setConfig(body.config);
      } catch (error) {
        if (!cancelled)
          setMessage({
            kind: "error",
            text: error instanceof Error ? error.message : tErrors("adminConsoleUnavailable"),
          });
      } finally {
        if (!cancelled) setBusy(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tErrors]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setMessage(null);
    try {
      const github = {
        clientId: config.github.clientId,
        enabled: config.github.enabled,
        ...(githubSecret.trim() ? { clientSecret: githubSecret.trim() } : {}),
      };
      const response = await adminFetch("/api/system/auth", {
        body: JSON.stringify({
          memberSignupEnabled: config.memberSignupEnabled,
          emailVerificationEnabled: config.emailVerificationEnabled,
          github,
        }),
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "PUT",
      });
      const body = (await response.json()) as AuthConfigResponse;
      if (!response.ok || !body.config)
        throw new Error(translateApiError(body, tErrors("authConfigUpdateFailed"), controlPlaneErrorKeys, tErrors));
      setConfig(body.config);
      setGithubSecret("");
      setMessage({ kind: "success", text: t("authPolicySaved") });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : tErrors("authConfigUpdateFailed"),
      });
    } finally {
      setSaving(false);
    }
  }

  if (busy) {
    return (
      <div className="flex min-h-svh items-center justify-center p-6" role="status">
        <LoaderCircle className="size-5 animate-spin" />
        <span className="sr-only">{t("loading")}</span>
      </div>
    );
  }

  return (
    <main className="min-h-svh bg-muted/30 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2 text-primary">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t("product")}</p>
              <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
            </div>
          </div>
          <Button onClick={() => void signOut()} type="button" variant="outline">
            <LogOut data-icon="inline-start" /> {t("signOut")}
          </Button>
        </header>

        {config ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("authenticationTitle")}</CardTitle>
              <CardDescription>{t("authenticationDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <div className="flex items-center justify-between gap-4 border-b pb-4">
                <div className="min-w-0">
                  <Label htmlFor="member-signup">{t("memberSignup")}</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{t("memberSignupDescription")}</p>
                </div>
                <Switch
                  id="member-signup"
                  checked={config.memberSignupEnabled}
                  onCheckedChange={(checked) => setConfig({ ...config, memberSignupEnabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-4 border-b pb-4">
                <div className="min-w-0">
                  <Label htmlFor="email-verification">{t("emailVerification")}</Label>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {config.emailVerificationAvailable
                      ? t("emailVerificationRequired")
                      : t("emailVerificationUnavailable")}
                  </p>
                </div>
                <Switch
                  id="email-verification"
                  checked={config.emailVerificationEnabled}
                  disabled={!config.emailVerificationAvailable}
                  onCheckedChange={(checked) => setConfig({ ...config, emailVerificationEnabled: checked })}
                />
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <Label htmlFor="github-enabled">{t("githubProvider")}</Label>
                    <p className="mt-1 text-sm text-muted-foreground">{t("githubProviderDescription")}</p>
                  </div>
                  <Switch
                    id="github-enabled"
                    checked={config.github.enabled}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, github: { ...config.github, enabled: checked } })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="github-client-id">{t("githubClientId")}</Label>
                  <Input
                    id="github-client-id"
                    value={config.github.clientId}
                    onChange={(event) =>
                      setConfig({ ...config, github: { ...config.github, clientId: event.target.value } })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="github-client-secret">{t("githubClientSecret")}</Label>
                  <Input
                    id="github-client-secret"
                    type="password"
                    autoComplete="new-password"
                    placeholder={
                      config.github.secretConfigured
                        ? t("githubClientSecretConfigured")
                        : t("githubClientSecretPlaceholder")
                    }
                    value={githubSecret}
                    onChange={(event) => setGithubSecret(event.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                {message ? (
                  <p
                    className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}
                    role="status"
                  >
                    {message.text}
                  </p>
                ) : (
                  <span />
                )}
                <Button disabled={saving} onClick={() => void save()} type="button">
                  <Save data-icon="inline-start" />
                  {saving ? t("saving") : t("saveChanges")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-8">
              <p className="text-sm text-destructive" role="alert">
                {message?.text ?? tErrors("authConfigUnavailable")}
              </p>
            </CardContent>
          </Card>
        )}

        <SystemConfigSurface />
        <P2PBootstrapSurface />
      </div>
    </main>
  );
}
