import { Link } from "@tanstack/react-router";
import {
  CircleAlert,
  Link2,
  LoaderCircle,
  Network,
  Send,
  Unplug,
  X,
} from "lucide-react";
import {
  type ReactElement,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { MtmP2pClient } from "../../features/p2p/client.js";
import type { P2pSnapshot } from "../../features/p2p/protocol.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Separator } from "../components/ui/separator.js";

function useP2pSnapshot(client: MtmP2pClient): P2pSnapshot {
  return useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  );
}

function statusLabel(snapshot: P2pSnapshot): string {
  if (snapshot.error?.includes("unavailable") === true)
    return "Worker unavailable";
  if (snapshot.discoveryStatus === "failed") return "Peer discovery failed";
  if (snapshot.status === "idle") return "Node initializing";
  if (snapshot.status === "connecting") return "Connecting";
  if (
    snapshot.status === "connected" &&
    snapshot.discoveryStatus === "connected"
  )
    return "Bootstrap connected";
  if (snapshot.status === "connected") return "Node ready";
  if (snapshot.status === "closed") return "Worker closed";
  return "Node error";
}

function statusVariant(
  snapshot: P2pSnapshot,
): "default" | "secondary" | "destructive" | "outline" {
  if (
    snapshot.error !== undefined ||
    snapshot.discoveryStatus === "failed" ||
    snapshot.status === "error"
  )
    return "destructive";
  if (snapshot.status === "connecting" || snapshot.status === "idle")
    return "secondary";
  return "outline";
}

export interface P2pDebugViewProps {
  client: MtmP2pClient;
  bootstrapAddress?: string;
  wide?: boolean;
}

export function P2pDebugView({
  client,
  bootstrapAddress,
  wide = false,
}: P2pDebugViewProps): ReactElement {
  const snapshot = useP2pSnapshot(client);
  const [address, setAddress] = useState(bootstrapAddress ?? "");
  const [peer, setPeer] = useState("");
  const [target, setTarget] = useState("/healthz");
  const [busy, setBusy] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestError, setRequestError] = useState<string>();
  const [response, setResponse] = useState<string>();
  const requestController = useRef<AbortController>();
  const firstPeer = snapshot.peers[0]?.id;

  useEffect(() => {
    if (peer === "" && firstPeer !== undefined) setPeer(firstPeer);
  }, [firstPeer, peer]);

  useEffect(() => () => requestController.current?.abort(), []);

  async function connect(): Promise<void> {
    setRequestError(undefined);
    if (!address.trim()) return;
    setBusy(true);
    try {
      await client.connect(address);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(peerId: string): Promise<void> {
    setRequestError(undefined);
    setBusy(true);
    try {
      await client.disconnect(peerId);
    } catch (error) {
      setRequestError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function sendRequest(): Promise<void> {
    const peerId = peer.trim();
    const path = target.trim();
    if (!peerId || !path || busy) return;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setRequestBusy(true);
    setBusy(true);
    setRequestError(undefined);
    setResponse(undefined);
    try {
      const result = await client.request(peerId, path, {
        signal: controller.signal,
      });
      setResponse(
        result.status +
          " " +
          result.statusText +
          "\n\n" +
          (await result.text()),
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setRequestError("Request failed: " + errorMessage(error));
    } finally {
      if (requestController.current === controller)
        requestController.current = undefined;
      setRequestBusy(false);
      setBusy(false);
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col overflow-y-auto bg-background"
      aria-label="P2P node debug"
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-border border-b px-4 py-3 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Network
            className="size-5 shrink-0 text-primary"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-base">P2P node</h1>
            <p className="truncate text-muted-foreground text-xs">
              Transport and peer state
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusVariant(snapshot)}>
            {statusLabel(snapshot)}
          </Badge>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            nativeButton={false}
            render={<Link to="/" />}
            aria-label="Back to conversation"
            title="Back to conversation"
          >
            <X />
          </Button>
        </div>
      </header>
      <div
        className={[
          "grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 md:p-6",
          wide ? "lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div className="min-w-0 space-y-5">
          <section
            className="border-border border bg-card p-4"
            aria-labelledby="p2p-node-status"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="p2p-node-status" className="font-medium text-sm">
                Node status
              </h2>
              <span className="font-mono text-muted-foreground text-xs">
                {snapshot.peerId ?? "-"}
              </span>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground text-xs">Worker</dt>
                <dd className="mt-1">
                  {snapshot.error?.includes("unavailable")
                    ? "Unavailable"
                    : "Available"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Local peer ID</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {snapshot.peerId ?? "Initializing"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Discovery</dt>
                <dd className="mt-1">{snapshot.discoveryStatus ?? "Idle"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Known peers</dt>
                <dd className="mt-1">{snapshot.peers.length}</dd>
              </div>
            </dl>
            {snapshot.discoveryError ? (
              <p className="mt-3 text-destructive text-xs" role="alert">
                {snapshot.discoveryError}
              </p>
            ) : null}
            {snapshot.error && snapshot.discoveryError === undefined ? (
              <p className="mt-3 text-destructive text-xs" role="alert">
                {snapshot.error}
              </p>
            ) : null}
          </section>

          <section
            className="border-border border bg-card p-4"
            aria-labelledby="p2p-connect"
          >
            <div className="flex items-center gap-2">
              <Link2 className="size-4 text-primary" aria-hidden="true" />
              <h2 id="p2p-connect" className="font-medium text-sm">
                Bootstrap connection
              </h2>
            </div>
            <form
              className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                void connect();
              }}
            >
              <input
                className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                placeholder="/ip4/127.0.0.1/tcp/443/wss/p2p/..."
                aria-label="Bootstrap address"
                disabled={busy}
              />
              <Button type="submit" disabled={busy || !address.trim()}>
                <Link2 data-icon="inline-start" />
                Connect
              </Button>
            </form>
            <p className="mt-2 break-all text-muted-foreground text-xs">
              {snapshot.discoveryStatus === "failed"
                ? snapshot.discoveryError
                : "Browser WebSocket transport only"}
            </p>
          </section>

          <section
            className="border-border border bg-card p-4"
            aria-labelledby="p2p-peers"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="p2p-peers" className="font-medium text-sm">
                Peers
              </h2>
              <span className="text-muted-foreground text-xs">
                {snapshot.peers.length}
              </span>
            </div>
            <div className="mt-3 divide-y divide-border border-border border-y">
              {snapshot.peers.length === 0 ? (
                <p className="py-6 text-center text-muted-foreground text-sm">
                  No peers discovered.
                </p>
              ) : (
                snapshot.peers.map((item) => (
                  <div key={item.id} className="space-y-2 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <span className="break-all font-mono text-xs">
                        {item.id}
                      </span>
                      <Badge
                        variant={
                          item.status === "connected" ? "secondary" : "outline"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                    <p className="break-all text-muted-foreground text-xs">
                      {item.addresses.join("\n") || "No address"}
                    </p>
                    <p className="break-all text-muted-foreground text-xs">
                      {item.protocols.join(", ") || "No protocols"}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busy || item.status !== "connected"}
                      onClick={() => void disconnect(item.id)}
                    >
                      <Unplug data-icon="inline-start" />
                      Disconnect
                    </Button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section
          className="min-w-0 border-border border bg-card p-4"
          aria-labelledby="p2p-request"
        >
          <div className="flex items-center gap-2">
            <Send className="size-4 text-primary" aria-hidden="true" />
            <h2 id="p2p-request" className="font-medium text-sm">
              HTTP-over-P2P
            </h2>
          </div>
          <p className="mt-2 text-muted-foreground text-xs">
            Requests stay on the restricted peer transport.
          </p>
          <div className="mt-4 space-y-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">Peer ID or address</span>
              <input
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={peer}
                onChange={(event) => setPeer(event.target.value)}
                aria-label="Request peer"
              />
            </label>
            <label className="block text-xs">
              <span className="text-muted-foreground">Path</span>
              <input
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                aria-label="Request path"
              />
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                className="flex-1"
                disabled={busy || !peer.trim() || !target.trim()}
                onClick={() => void sendRequest()}
              >
                <Send data-icon="inline-start" />
                Send request
              </Button>
              <Button
                type="button"
                size="icon"
                variant="outline"
                disabled={!requestBusy}
                onClick={() => requestController.current?.abort()}
                aria-label="Cancel request"
                title="Cancel request"
              >
                <X />
              </Button>
            </div>
          </div>
          <Separator className="my-4" />
          {requestError ? (
            <div
              className="flex items-start gap-2 text-destructive text-xs"
              role="alert"
            >
              <CircleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              <span>{requestError}</span>
            </div>
          ) : null}
          {response !== undefined ? (
            <pre
              className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/30 p-3 font-mono text-xs"
              aria-live="polite"
            >
              {response}
            </pre>
          ) : null}
          {requestBusy ? (
            <p
              className="flex items-center gap-2 text-muted-foreground text-xs"
              role="status"
            >
              <LoaderCircle className="size-3 animate-spin" />
              Request in progress
            </p>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
