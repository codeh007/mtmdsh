import { createSnapshotStore, type SnapshotStore } from "@deepseek-ai/dsh-client-store";
import type { SettingsScope } from "@deepseek-ai/dsh-client-ui-settings/client";
import type { MtmSecondaryClientRuntime, MtmSecondarySnapshot } from "../../secondary/client.js";
import type { MtmAdminSettings } from "../index.js";

export interface MtmAdminCardState {
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

export interface MtmAdminCardFace {
  readonly hooks: { mtmAdminCard: SnapshotStore<MtmAdminCardState> };
  readonly edit: (enabled: boolean) => void;
  readonly save: () => void;
  readonly discard: () => void;
  readonly reset: () => void;
  readonly open: () => void;
}

type Staged = { readonly enabled: boolean; readonly clear: boolean };
type AdminSettingsSnapshot = ReturnType<SettingsScope<MtmAdminSettings>["getSnapshot"]>;

function resolvedEnabled(snapshot: AdminSettingsSnapshot): boolean {
  return (snapshot.value as Record<string, unknown> | undefined)?.enabled === true;
}

function baseEnabled(snapshot: AdminSettingsSnapshot): boolean {
  return ((snapshot.base as Record<string, unknown> | undefined)?.enabled ?? false) === true;
}

function userHasEnabled(snapshot: AdminSettingsSnapshot): boolean {
  const user = snapshot.user as Record<string, unknown> | undefined;
  return user !== undefined && Object.hasOwn(user, "enabled");
}

/** Settings state and lifecycle controller for the Admin launcher. */
export class MtmAdminCardController {
  private staged: Staged | undefined;
  private readonly store: SnapshotStore<MtmAdminCardState>;
  private saving = false;
  private failed = false;
  private disposed = false;
  private readonly stopSettings: () => void;
  private readonly stopRuntime: () => void;
  private reconciling = Promise.resolve();

  constructor(
    private readonly scope: SettingsScope<MtmAdminSettings>,
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

  inject(): MtmAdminCardFace {
    return {
      hooks: { mtmAdminCard: this.store },
      edit: (enabled) => { this.edit(enabled); },
      save: () => { void this.save(); },
      discard: () => { this.discard(); },
      reset: () => { this.reset(); },
      open: () => { this.runtime.show("[data-mtm-admin-launcher]"); },
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
      if (staged.clear ? userHasEnabled(snapshot) : resolvedEnabled(snapshot) !== staged.enabled) {
        throw new Error("MTM Admin setting was not accepted");
      }
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

  private projection(): MtmAdminCardState {
    const snapshot = this.scope.getSnapshot();
    const staged = this.staged;
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      enabled: staged?.enabled ?? resolvedEnabled(snapshot),
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
