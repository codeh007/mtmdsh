import { Link } from "@tanstack/react-router";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/badge.js";
import { Button } from "../../components/ui/button.js";
import type { MtmP2pClient } from "../p2p/client.js";
import type { P2pSocket } from "../p2p/socket.js";
import type { createRfb } from "./rfb.js";
import { confirmVnc, type VncDescription } from "./service.js";

type Rfb = ReturnType<typeof createRfb>;

export function DesktopAction({
  client,
  peer,
  address,
}: {
  client: MtmP2pClient;
  peer: string;
  address?: string;
}): ReactElement {
  const [description, setDescription] = useState<VncDescription>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a user retry rechecks the same peer.
  useEffect(() => {
    const controller = new AbortController();
    setDescription(undefined);
    setError(undefined);
    void confirmVnc(client, peer, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDescription(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Desktop unavailable",
          );
      });
    return () => controller.abort();
  }, [client, peer, attempt]);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="outline">
        {description?.state ??
          (error ? "Desktop unavailable" : "Checking desktop")}
      </Badge>
      {description && description.state !== "unavailable" ? (
        <Button
          size="sm"
          variant="outline"
          nativeButton={false}
          render={
            <Link
              to="/vnc"
              search={{ peer, address: address ?? "", instance: "desktop" }}
            />
          }
        >
          Open desktop
        </Button>
      ) : null}
      {error ? (
        <>
          <span className="text-muted-foreground text-xs">{error}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Check again
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function VncView({
  client,
  peer,
  address,
  moduleUrl,
}: {
  client: MtmP2pClient;
  peer: string;
  address?: string;
  moduleUrl?: string;
}): ReactElement {
  const container = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const rfbRef = useRef<Rfb>();
  const [request, setRequest] = useState<{
    attempt: number;
    action?: "start" | "stop";
  }>({ attempt: 0 });
  const [description, setDescription] = useState<VncDescription>();
  const [status, setStatus] = useState("Checking desktop");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [fit, setFit] = useState(true);
  const startedByView = useRef(false);
  const target = address || peer;

  useEffect(() => {
    const controller = new AbortController();
    let rfb: Rfb | undefined;
    let socket: P2pSocket | undefined;
    let observer: ResizeObserver | undefined;
    setBusy(true);
    setFit(true);
    setError(undefined);
    setDescription(undefined);
    setStatus(
      request.action === "start" ? "Starting desktop" : "Checking desktop",
    );
    if (request.action === "start") startedByView.current = true;
    void (async () => {
      if (!peer || (address && !address.endsWith(`/p2p/${peer}`)))
        throw new Error("The desktop link does not match its target peer.");
      const desc = await confirmVnc(
        client,
        target,
        controller.signal,
        request.action,
      );
      controller.signal.throwIfAborted();
      setDescription(desc);
      if (desc.state !== "ready") {
        setStatus(desc.state);
        return;
      }
      if (!desc.carriers.includes("libp2p-http-websocket"))
        throw new Error(
          "This node does not provide a compatible desktop data connection.",
        );
      if (!moduleUrl)
        throw new Error("The desktop client asset URL is unavailable.");
      const module = (await import(/* @vite-ignore */ moduleUrl)) as {
        createRfb: typeof createRfb;
      };
      controller.signal.throwIfAborted();
      if (!container.current || !input.current) return;
      const params = new URLSearchParams({
        instance: desc.instance,
        generation: desc.generation ?? "",
      });
      socket = client.openSocket(
        target,
        `/api/vnc/connect?${params}`,
        controller.signal,
      );
      rfb = module.createRfb(container.current, input.current, socket);
      rfbRef.current = rfb;
      setStatus("Connecting desktop");
      rfb.addEventListener("connect", () => {
        if (!controller.signal.aborted) setStatus("Connected");
      });
      rfb.addEventListener("disconnect", () => {
        if (!controller.signal.aborted) setStatus("Disconnected");
      });
      rfb.addEventListener("securityfailure", () => {
        if (!controller.signal.aborted)
          setError("Desktop authentication failed.");
      });
      rfb.addEventListener("credentialsrequired", () => {
        if (!controller.signal.aborted)
          setError("The node requires unsupported desktop credentials.");
        socket?.close();
      });
      socket.addEventListener("close", (event) => {
        if (!controller.signal.aborted && (event as CloseEvent).reason)
          setError((event as CloseEvent).reason);
      });
      observer = new ResizeObserver(() => {
        if (!rfb) return;
        // The public setter queues a layout update; apply after restoring the
        // selected mode so container resizes do not change desktop resolution.
        const scale = rfb.scaleViewport;
        rfb.scaleViewport = !scale;
        rfb.scaleViewport = scale;
        rfb.updateConnectionSettings();
      });
      observer.observe(container.current);
    })()
      .catch((error: unknown) => {
        socket?.close();
        rfb?.disconnect();
        if (!controller.signal.aborted) {
          setError(
            error instanceof Error
              ? error.message
              : "Desktop connection failed",
          );
          setStatus("Unavailable");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      if (startedByView.current) {
        void confirmVnc(
          client,
          target,
          new AbortController().signal,
          "stop",
        ).catch(() => undefined);
      }
      observer?.disconnect();
      rfb?.disconnect();
      socket?.close();
      rfbRef.current = undefined;
    };
  }, [client, peer, address, target, moduleUrl, request]);

  function action(next?: "start" | "stop"): void {
    setRequest((value) => ({ attempt: value.attempt + 1, action: next }));
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label="Remote desktop"
    >
      <header className="flex flex-wrap items-center gap-2 border-b p-3">
        <h1 className="font-semibold">Desktop</h1>
        <Badge variant="outline">{status}</Badge>
        <span
          className="min-w-0 flex-1 truncate font-mono text-xs"
          title={peer}
        >
          {peer}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => action()}
        >
          Reconnect / check
        </Button>
        {description && ["startable", "failed"].includes(description.state) ? (
          <Button size="sm" disabled={busy} onClick={() => action("start")}>
            Start desktop
          </Button>
        ) : null}
        {description?.state === "ready" ? (
          <Button
            variant="destructive"
            size="sm"
            disabled={busy}
            onClick={() => action("stop")}
          >
            Stop shared desktop
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={status !== "Connected"}
          onClick={() => {
            const next = !fit;
            setFit(next);
            if (rfbRef.current) {
              rfbRef.current.scaleViewport = next;
              rfbRef.current.updateConnectionSettings();
            }
          }}
        >
          {fit ? "Actual pixels" : "Fit to view"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link to="/p2p" />}
        >
          Close view
        </Button>
      </header>
      {error ? (
        <p role="alert" className="p-3 text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <p className="px-3 py-2 text-muted-foreground text-xs">
        Anonymous test desktop · Mouse and keyboard · Server resolution ·
        Clipboard, audio and multiple monitors are not supported. Closing this
        view leaves the shared desktop running.
      </p>
      <div
        ref={container}
        className="relative min-h-0 flex-1 overflow-hidden"
      />
      <textarea
        ref={input}
        className="sr-only"
        aria-label="Desktop keyboard input"
        autoCapitalize="off"
        autoComplete="off"
        spellCheck={false}
      />
    </section>
  );
}
