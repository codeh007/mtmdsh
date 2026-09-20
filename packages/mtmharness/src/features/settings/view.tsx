import { type ReactElement, useState, useSyncExternalStore } from "react";
import type { PonytailMode, RtkMode } from "../coding/types.js";
import type {
  MtmHarnessCapability,
  MtmHarnessCapabilitySnapshot,
  MtmHarnessSettingsCapability,
  MtmHarnessSettingsField,
  MtmHarnessSettingsSnapshot,
  MtmHarnessSettingsValue,
} from "./contract.js";
import { SETTINGS_FIELDS } from "./contract.js";

const UNAVAILABLE: MtmHarnessCapabilitySnapshot = { status: "unavailable" };
const UNAVAILABLE_SETTINGS: MtmHarnessSettingsSnapshot = {
  status: "unavailable",
  writable: false,
};
const NOOP_SUBSCRIBE =
  (_listener: () => void): (() => void) =>
  () =>
    undefined;

function useCapabilitySnapshot(
  capability: MtmHarnessCapability | undefined,
): MtmHarnessCapabilitySnapshot {
  return useSyncExternalStore(
    capability?.subscribe ?? NOOP_SUBSCRIBE,
    capability?.getSnapshot ?? (() => UNAVAILABLE),
    capability?.getSnapshot ?? (() => UNAVAILABLE),
  );
}

function useSettingsSnapshot(
  capability: MtmHarnessSettingsCapability | undefined,
): MtmHarnessSettingsSnapshot {
  return useSyncExternalStore(
    capability?.subscribe ?? NOOP_SUBSCRIBE,
    capability?.getSnapshot ?? (() => UNAVAILABLE_SETTINGS),
    capability?.getSnapshot ?? (() => UNAVAILABLE_SETTINGS),
  );
}

function statusLabel(snapshot: MtmHarnessCapabilitySnapshot): string {
  if (snapshot.status === "available") return "Available";
  if (snapshot.status === "read-only") return "Read-only";
  if (snapshot.status === "error") return "Error";
  return "Unavailable";
}

function CapabilityRow({
  name,
  capability,
}: {
  name: string;
  capability?: MtmHarnessCapability;
}): ReactElement {
  const snapshot = useCapabilitySnapshot(capability);
  return (
    <li className="flex items-start justify-between gap-4 border-border border-b py-3 last:border-b-0">
      <span className="font-medium text-sm">{name}</span>
      <span className="text-right text-muted-foreground text-sm">
        <span data-capability={name} data-status={snapshot.status}>
          {statusLabel(snapshot)}
        </span>
        {snapshot.message ? (
          <span className="block text-xs">{snapshot.message}</span>
        ) : null}
      </span>
    </li>
  );
}

const LABELS: Record<MtmHarnessSettingsField, string> = {
  codebaseMemoryEnabled: "Codebase Memory",
  codebaseMemoryAugmentHooks: "Codebase Memory context",
  ponytailEnabled: "Ponytail",
  ponytailMode: "Ponytail mode",
  ponytailSubagents: "Ponytail for subagents",
  rtkMode: "RTK mode",
};

const MODE_VALUES: readonly PonytailMode[] = ["off", "lite", "full", "ultra"];
const RTK_VALUES: readonly RtkMode[] = ["off", "guidance", "auto", "rewrite"];

function CodingSettings({
  capability,
}: {
  capability?: MtmHarnessSettingsCapability;
}): ReactElement {
  const snapshot = useSettingsSnapshot(capability);
  const [busy, setBusy] = useState<MtmHarnessSettingsField>();
  const [error, setError] = useState<string>();
  const value = snapshot.value ?? {};

  async function update<K extends MtmHarnessSettingsField>(
    field: K,
    next: MtmHarnessSettingsValue[K],
  ): Promise<void> {
    if (capability === undefined || !snapshot.writable || busy !== undefined)
      return;
    setBusy(field);
    setError(undefined);
    try {
      await capability.set(field, next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(undefined);
    }
  }

  async function reset(field: MtmHarnessSettingsField): Promise<void> {
    if (capability === undefined || !snapshot.writable || busy !== undefined)
      return;
    setBusy(field);
    setError(undefined);
    try {
      await capability.unset(field);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(undefined);
    }
  }

  if (snapshot.status === "unavailable" || snapshot.status === "error") {
    return (
      <section
        aria-labelledby="coding-settings-title"
        className="border-border border-t pt-5"
      >
        <h2 className="font-semibold text-base" id="coding-settings-title">
          Coding settings
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          {snapshot.message ?? statusLabel(snapshot)}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="coding-settings-title"
      className="border-border border-t pt-5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-semibold text-base" id="coding-settings-title">
          Coding settings
        </h2>
        <span className="text-muted-foreground text-sm">
          {statusLabel(snapshot)}
        </span>
      </div>
      <div className="mt-3 grid gap-3">
        {(
          [
            "codebaseMemoryEnabled",
            "codebaseMemoryAugmentHooks",
            "ponytailEnabled",
            "ponytailSubagents",
          ] as const
        ).map((field) => (
          <label
            className="flex items-center justify-between gap-4 text-sm"
            key={field}
          >
            <span>{LABELS[field]}</span>
            <input
              aria-label={LABELS[field]}
              checked={value[field] === true}
              disabled={!snapshot.writable || busy !== undefined}
              onChange={(event) => void update(field, event.target.checked)}
              type="checkbox"
            />
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          <span>{LABELS.ponytailMode}</span>
          <select
            aria-label={LABELS.ponytailMode}
            disabled={!snapshot.writable || busy !== undefined}
            onChange={(event) =>
              void update("ponytailMode", event.target.value as PonytailMode)
            }
            value={value.ponytailMode ?? "full"}
          >
            {MODE_VALUES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span>{LABELS.rtkMode}</span>
          <select
            aria-label={LABELS.rtkMode}
            disabled={!snapshot.writable || busy !== undefined}
            onChange={(event) =>
              void update("rtkMode", event.target.value as RtkMode)
            }
            value={value.rtkMode ?? "auto"}
          >
            {RTK_VALUES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>
      </div>
      {Object.keys(snapshot.user ?? {}).length > 0 ? (
        <button
          className="mt-3 text-muted-foreground text-xs underline"
          disabled={!snapshot.writable || busy !== undefined}
          onClick={() =>
            void Promise.all(
              Object.keys(snapshot.user ?? {})
                .filter((field): field is MtmHarnessSettingsField =>
                  SETTINGS_FIELDS.includes(field as MtmHarnessSettingsField),
                )
                .map((field) => reset(field)),
            )
          }
          type="button"
        >
          Reset overrides
        </button>
      ) : null}
      {error ? (
        <p className="mt-2 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export interface MtmHarnessSettingsViewProps {
  readonly auth?: MtmHarnessCapability;
  readonly api?: MtmHarnessCapability;
  readonly p2p?: MtmHarnessCapability;
  readonly dshLocal?: MtmHarnessCapability;
  readonly settings?: MtmHarnessSettingsCapability;
}

export function MtmHarnessSettingsView({
  auth,
  api,
  p2p,
  dshLocal,
  settings,
}: MtmHarnessSettingsViewProps): ReactElement {
  return (
    <main
      className="mx-auto w-full max-w-2xl overflow-auto p-5"
      data-settings-view
    >
      <header>
        <h1 className="font-semibold text-xl">Settings</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Capability status and browser-owned configuration.
        </p>
      </header>
      <section aria-labelledby="capabilities-title" className="mt-6">
        <h2 className="font-semibold text-base" id="capabilities-title">
          Capabilities
        </h2>
        <ul className="mt-2 border-border border-t">
          <CapabilityRow capability={auth} name="Authentication" />
          <CapabilityRow capability={api} name="Remote product API" />
          <CapabilityRow capability={p2p} name="P2P browser node" />
          <CapabilityRow capability={dshLocal} name="DSH local host" />
        </ul>
      </section>
      <CodingSettings capability={settings} />
    </main>
  );
}
