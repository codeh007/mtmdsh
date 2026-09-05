"use client";

import { adminFetch } from "../../admin-fetch";
import { Download, LoaderCircle, Save, Upload } from "lucide-react";
import { useTranslations } from "../../i18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { translateApiError } from "../../lib/i18n/api-error";

const CONFIG_ENDPOINT = "/api/system/config";

const DEFAULT_DOCUMENT = {
  schemaVersion: 1,
  instance: { label: "" },
  secrets: {},
} as const;

type Published = {
  createdAt: string;
  document: unknown;
  revision: string;
  scope: string;
};

type Message = { kind: "error" | "success"; text: string };
type ConfigResponse = {
  published?: Published | null;
  error?: { code?: string; message?: string };
};

const systemConfigErrorKeys = {
  platform_admin_required: "platformAdminRequired",
  system_config_auth_required: "authRequired",
  system_config_auth_unavailable: "authUnavailable",
  system_config_import_invalid: "importInvalid",
  system_config_invalid: "invalid",
  system_config_not_published: "notPublished",
  system_config_revision_not_found: "revisionNotFound",
  system_config_unavailable: "unavailable",
} as const;

export function SystemConfigSurface() {
  const [published, setPublished] = useState<Published | null>(null);
  const [documentJson, setDocumentJson] = useState(() => JSON.stringify(DEFAULT_DOCUMENT, null, 2));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const t = useTranslations("admin.systemConfig");
  const tErrors = useTranslations("admin.systemConfig.errors");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminFetch(CONFIG_ENDPOINT, { headers: { accept: "application/json" } });
      const body = (await response.json()) as ConfigResponse;
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: translateApiError(body, tErrors("loadFailed"), systemConfigErrorKeys, tErrors),
        });
        return;
      }
      if (body.published) {
        setPublished(body.published);
        setDocumentJson(JSON.stringify(body.published.document, null, 2));
      } else {
        setPublished(null);
        setMessage(null);
      }
    } catch {
      setMessage({ kind: "error", text: tErrors("requestFailed") });
    } finally {
      setLoading(false);
    }
  }, [tErrors]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function publish() {
    setBusy(true);
    setMessage(null);
    try {
      let document: unknown;
      try {
        document = JSON.parse(documentJson);
      } catch {
        setMessage({ kind: "error", text: tErrors("invalidJson") });
        return;
      }
      const response = await adminFetch(CONFIG_ENDPOINT, {
        body: JSON.stringify(document),
        headers: { "content-type": "application/json" },
        method: "PUT",
      });
      const body = (await response.json()) as ConfigResponse;
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: translateApiError(body, tErrors("publishFailed"), systemConfigErrorKeys, tErrors),
        });
        return;
      }
      if (body.published) {
        setPublished(body.published);
        setDocumentJson(JSON.stringify(body.published.document, null, 2));
        setMessage({ kind: "success", text: t("published", { revision: body.published.revision }) });
      }
    } catch {
      setMessage({ kind: "error", text: tErrors("publishFailed") });
    } finally {
      setBusy(false);
    }
  }

  async function exportConfig() {
    try {
      const response = await adminFetch(`${CONFIG_ENDPOINT}/export`, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(tErrors("exportFailed"));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "gomtmui-system-config.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      setMessage({ kind: "error", text: tErrors("exportFailed") });
    }
  }

  async function importConfig(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await adminFetch(`${CONFIG_ENDPOINT}/import`, {
        body: await file.text(),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body = (await response.json()) as ConfigResponse;
      if (!response.ok) {
        setMessage({
          kind: "error",
          text: translateApiError(body, tErrors("importFailed"), systemConfigErrorKeys, tErrors),
        });
        return;
      }
      if (body.published) {
        setPublished(body.published);
        setDocumentJson(JSON.stringify(body.published.document, null, 2));
        setMessage({ kind: "success", text: t("importedPublished", { revision: body.published.revision }) });
      }
    } catch {
      setMessage({ kind: "error", text: tErrors("importFailed") });
    } finally {
      setBusy(false);
    }
  }

  const controlsDisabled = loading || busy;

  return (
    <section aria-busy={controlsDisabled} aria-labelledby="system-config-title" className="w-full">
      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <CardTitle id="system-config-title">{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={controlsDisabled} onClick={() => void exportConfig()} type="button" variant="outline">
              <Download data-icon="inline-start" />
              {t("export")}
            </Button>
            <Button
              disabled={controlsDisabled}
              onClick={() => fileInputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <Upload data-icon="inline-start" />
              {t("import")}
            </Button>
            <Button disabled={controlsDisabled} onClick={() => void publish()} type="button">
              <Save data-icon="inline-start" />
              {busy ? t("publishing") : t("publish")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : published ? (
            <p className="text-sm">
              {t("currentRevision")} <span className="font-medium">{published.revision}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("notPublished")}</p>
          )}
          <textarea
            aria-label={t("jsonLabel")}
            className="min-h-72 w-full resize-y rounded-lg border bg-background p-3 font-mono text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            id="system-config-document"
            onChange={(event) => setDocumentJson(event.target.value)}
            spellCheck={false}
            value={documentJson}
          />
          <input
            accept="application/json,.json"
            className="hidden"
            disabled={controlsDisabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importConfig(file);
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
          {message ? (
            <p
              aria-live="polite"
              className={message.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-600"}
              role="status"
            >
              {message.text}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
