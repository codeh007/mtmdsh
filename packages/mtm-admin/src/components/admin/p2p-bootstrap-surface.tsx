"use client";

import { adminFetch } from "../../admin-fetch";
import { Check, Copy, LoaderCircle, Radio, RefreshCw, Save } from "lucide-react";
import { useTranslations } from "../../i18n";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";

type Snapshot = {
  node_id: string;
  revision: number;
  generation: number;
  capabilities: string[];
  services: string[];
  data: Record<string, string>;
};

type BootstrapStatus = {
  peer_id: string;
  multiaddr: string;
  protocols: string[];
  connections: { peer_id: string; address: string; status: string }[];
  snapshot: Snapshot;
  websocket_mode: string;
};

type SnapshotDraft = {
  capabilities: string;
  services: string;
  data: string;
};

type Message = { kind: "error" | "success"; text: string };

export function P2PBootstrapSurface() {
  const t = useTranslations("admin.p2p");
  const [status, setStatus] = useState<BootstrapStatus | null>(null);
  const [draft, setDraft] = useState<SnapshotDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await adminFetch("/p2p/bootstrap", { headers: { accept: "application/json" } });
      const body = (await response.json()) as BootstrapStatus & { error?: string };
      if (!response.ok || !body.snapshot) throw new Error(body.error ?? t("errors.loadFailed"));
      setStatus(body);
      setDraft(toDraft(body.snapshot));
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : t("errors.loadFailed") });
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function copyAddress() {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.multiaddr);
      setCopied(true);
      setMessage({ kind: "success", text: t("addressCopied") });
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setMessage({ kind: "error", text: t("errors.copyFailed") });
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const data = JSON.parse(draft.data) as unknown;
      if (!isStringMap(data)) throw new Error(t("errors.invalidData"));
      const response = await adminFetch("/api/system/p2p/bootstrap/config", {
        body: JSON.stringify({
          capabilities: splitLines(draft.capabilities),
          services: splitLines(draft.services),
          data,
        }),
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "PUT",
      });
      const body = (await response.json()) as Snapshot & { error?: string };
      if (!response.ok || !body.node_id) throw new Error(body.error ?? t("errors.saveFailed"));
      setStatus((current) => (current ? { ...current, snapshot: body } : current));
      setDraft(toDraft(body));
      setMessage({ kind: "success", text: t("saved") });
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof Error ? error.message : t("errors.saveFailed") });
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving || draft === null;

  return (
    <section aria-busy={loading || saving} aria-labelledby="p2p-bootstrap-title">
      <Card>
        <CardHeader className="gap-3 sm:flex sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-md bg-sky-500/10 p-2 text-sky-700 dark:text-sky-300">
              <Radio className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle id="p2p-bootstrap-title">{t("title")}</CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button disabled={loading} onClick={() => void refresh()} type="button" variant="outline">
              <RefreshCw className={loading ? "animate-spin" : undefined} data-icon="inline-start" />
              {t("refresh")}
            </Button>
            <Button disabled={!status} onClick={() => void copyAddress()} type="button" variant="outline">
              {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
              {t("copyAddress")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
              <LoaderCircle className="size-4 animate-spin" />
              {t("loading")}
            </div>
          ) : status && draft ? (
            <>
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div className="min-w-0">
                  <dt className="text-muted-foreground">{t("peerId")}</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{status.peer_id}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-muted-foreground">{t("bootstrapAddress")}</dt>
                  <dd className="mt-1 break-all font-mono text-xs">{status.multiaddr}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("revision")}</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary">{status.snapshot.revision}</Badge>
                    <span className="text-muted-foreground">
                      {t("generation", { value: status.snapshot.generation })}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("connections")}</dt>
                  <dd className="mt-1">{status.connections.length}</dd>
                </div>
              </dl>
              <div className="grid gap-4 border-t pt-5">
                <div className="grid gap-2">
                  <Label htmlFor="p2p-capabilities">{t("capabilities")}</Label>
                  <Textarea
                    id="p2p-capabilities"
                    onChange={(event) => setDraft({ ...draft, capabilities: event.target.value })}
                    rows={3}
                    value={draft.capabilities}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p2p-services">{t("services")}</Label>
                  <Textarea
                    id="p2p-services"
                    onChange={(event) => setDraft({ ...draft, services: event.target.value })}
                    rows={3}
                    value={draft.services}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="p2p-data">{t("data")}</Label>
                  <Textarea
                    className="min-h-32 font-mono text-sm"
                    id="p2p-data"
                    onChange={(event) => setDraft({ ...draft, data: event.target.value })}
                    spellCheck={false}
                    value={draft.data}
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
                <Button disabled={disabled} onClick={() => void save()} type="button">
                  <Save data-icon="inline-start" />
                  {saving ? t("saving") : t("save")}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-destructive" role="alert">
              {message?.text ?? t("errors.loadFailed")}
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function toDraft(snapshot: Snapshot): SnapshotDraft {
  return {
    capabilities: snapshot.capabilities.join("\n"),
    services: snapshot.services.join("\n"),
    data: JSON.stringify(snapshot.data, null, 2),
  };
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function isStringMap(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}
