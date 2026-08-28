import type { SettingsScope, SnapshotStore } from "@deepseek-ai/dsh-client-runtime/client";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-runtime/client";
import type { MtmSecondaryClientRuntime, MtmSecondarySnapshot } from "../../secondary/client.js";
import type { MtmConnectSettings } from "../index.js";

export interface MtmConnectCardState {
  readonly available: boolean;
  readonly writable: boolean;
  readonly enabled: boolean;
  readonly overridden: boolean;
  readonly dirty: boolean;
  readonly saving: boolean;
  readonly failed: boolean;
  readonly status: MtmSecondarySnapshot["status"];
  readonly error?: string;
}

export interface MtmConnectCardFace {
  readonly hooks: { mtmConnectCard: SnapshotStore<MtmConnectCardState> };
  readonly edit: (enabled: boolean) => void;
  readonly save: () => void;
  readonly discard: () => void;
  readonly reset: () => void;
  readonly open: () => void;
}

type Staged = { readonly enabled: boolean; readonly clear: boolean };

type ConnectSettingsSnapshot = ReturnType<SettingsScope<MtmConnectSettings>["getSnapshot"]>;

function resolvedEnabled(snapshot: ConnectSettingsSnapshot): boolean {
  return (snapshot.value as Record<string, unknown> | undefined)?.enabled === true;
}

function baseEnabled(snapshot: ConnectSettingsSnapshot): boolean {
  return ((snapshot.base as Record<string, unknown> | undefined)?.enabled ?? true) === true;
}

function userHasEnabled(snapshot: ConnectSettingsSnapshot): boolean {
  const user = snapshot.user as Record<string, unknown> | undefined;
  return user !== undefined && Object.hasOwn(user, "enabled");
}

/** Staged settings card and live secondary-extension lifecycle. */
export class MtmConnectCardController {
  private staged: Staged | undefined;
  private readonly store: SnapshotStore<MtmConnectCardState>;
  private saving = false;
  private failed = false;
  private disposed = false;
  private readonly stopSettings: () => void;
  private readonly stopRuntime: () => void;
  private reconciling = Promise.resolve();

  constructor(
    private readonly scope: SettingsScope<MtmConnectSettings>,
    private readonly runtime: MtmSecondaryClientRuntime,
  ) {
    this.store = createSnapshotStore(this.projection());
    this.stopSettings = scope.subscribe(() => {
      this.publish();
      void this.queueReconcile().catch(() => { this.failed = true; this.publish(); });
    });
    this.stopRuntime = runtime.subscribe(() => { this.publish(); });
    void this.queueReconcile().catch(() => { this.failed = true; this.publish(); });
  }

  inject(): MtmConnectCardFace {
    return {
      hooks: { mtmConnectCard: this.store },
      edit: (enabled) => { this.edit(enabled); },
      save: () => { void this.save(); },
      discard: () => { this.discard(); },
      reset: () => { this.reset(); },
      open: () => { this.runtime.show("[data-mtm-connect-focus]"); },
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.stopSettings();
    this.stopRuntime();
    await this.reconciling;
    await this.runtime.dispose();
  }

  private edit(enabled: boolean): void {
    this.staged = { enabled, clear: false };
    this.failed = false;
    this.publish();
  }

  private discard(): void {
    this.staged = undefined;
    this.failed = false;
    this.publish();
  }

  private reset(): void {
    this.staged = { enabled: baseEnabled(this.scope.getSnapshot()), clear: true };
    this.failed = false;
    this.publish();
  }

  private async save(): Promise<void> {
    const staged = this.staged;
    if (this.saving || staged === undefined || !this.scope.getSnapshot().writable) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    try {
      if (staged.clear) await this.scope.unset("enabled");
      else await this.scope.set("enabled", staged.enabled);
      const snapshot = this.scope.getSnapshot();
      if (staged.clear ? userHasEnabled(snapshot) : resolvedEnabled(snapshot) !== staged.enabled) throw new Error("MTM Connect setting was not accepted");
      this.staged = undefined;
      await this.queueReconcile();
    } catch {
      this.failed = true;
    } finally {
      this.saving = false;
      this.publish();
    }
  }

  private queueReconcile(): Promise<void> {
    const operation = this.reconciling.then(() => this.reconcile(), () => this.reconcile());
    this.reconciling = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async reconcile(): Promise<void> {
    if (this.disposed) return;
    await this.runtime.setEnabled(resolvedEnabled(this.scope.getSnapshot()));
    this.publish();
  }

  private projection(): MtmConnectCardState {
    const snapshot = this.scope.getSnapshot();
    const staged = this.staged;
    const enabled = staged?.enabled ?? resolvedEnabled(snapshot);
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      enabled,
      overridden: staged?.clear === true ? false : staged !== undefined || userHasEnabled(snapshot),
      dirty: staged !== undefined,
      saving: this.saving,
      failed: this.failed,
      status: this.runtime.getSnapshot().status,
      error: this.runtime.getSnapshot().error,
    };
  }

  private publish(): void {
    if (!this.disposed) this.store.set(this.projection());
  }
}
