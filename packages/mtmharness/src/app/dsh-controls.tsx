import { LoaderCircle, Plug, Unplug } from "lucide-react";
import { type ReactElement, useState, useSyncExternalStore } from "react";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import type {
  MtmHarnessDshIntegrationBridge,
  MtmHarnessDshIntegrationSnapshot,
} from "../host/contract.js";

function statusLabel(snapshot: MtmHarnessDshIntegrationSnapshot): string {
  if (snapshot.status === "active") return "DSH active";
  if (snapshot.status === "loading") return "DSH loading";
  if (snapshot.status === "disposing") return "DSH stopping";
  if (snapshot.status === "failed") return "DSH failed";
  return "DSH unavailable";
}

const UNAVAILABLE_SNAPSHOT: MtmHarnessDshIntegrationSnapshot = {
  status: "unavailable",
};
const getUnavailableSnapshot = (): MtmHarnessDshIntegrationSnapshot =>
  UNAVAILABLE_SNAPSHOT;
const NOOP_SUBSCRIBE =
  (_listener: () => void): (() => void) =>
  () =>
    undefined;

export function DshIntegrationControl({
  bridge,
  onOpenP2p,
}: {
  bridge?: MtmHarnessDshIntegrationBridge;
  onOpenP2p?: () => Promise<void>;
}): ReactElement {
  const snapshot = useSyncExternalStore(
    bridge?.subscribe ?? NOOP_SUBSCRIBE,
    bridge?.getSnapshot ?? getUnavailableSnapshot,
    bridge?.getSnapshot ?? getUnavailableSnapshot,
  );
  const [busy, setBusy] = useState(false);

  async function toggle(): Promise<void> {
    if (bridge === undefined || busy) return;
    setBusy(true);
    try {
      if (snapshot.status === "active") await bridge.disable();
      else await bridge.enable();
      await onOpenP2p?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      data-dsh-integration={snapshot.status}
    >
      <Badge variant={snapshot.status === "failed" ? "destructive" : "outline"}>
        {statusLabel(snapshot)}
      </Badge>
      {bridge !== undefined && snapshot.status !== "disposing" ? (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={busy || snapshot.status === "loading"}
          onClick={() => void toggle()}
          aria-label={
            snapshot.status === "active"
              ? "Disable DSH integration"
              : "Enable DSH integration"
          }
          title={
            snapshot.status === "active"
              ? "Disable DSH integration"
              : "Enable DSH integration"
          }
        >
          {busy || snapshot.status === "loading" ? (
            <LoaderCircle className="animate-spin" />
          ) : snapshot.status === "active" ? (
            <Unplug />
          ) : (
            <Plug />
          )}
        </Button>
      ) : null}
      {snapshot.error ? (
        <span className="sr-only" role="alert">
          {snapshot.error}
        </span>
      ) : null}
    </div>
  );
}
