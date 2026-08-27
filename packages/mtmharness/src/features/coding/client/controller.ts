import type { SettingsScope, SnapshotStore } from "@deepseek-ai/dsh-client-runtime/client";
import { createSnapshotStore } from "@deepseek-ai/dsh-client-runtime/client";
import type { MtmCodingSettings, PonytailMode, RtkMode } from "../types.js";

export const SETTINGS_NAMESPACE = "mtm-coding";
export const MODE_VALUES: readonly PonytailMode[] = ["off", "lite", "full", "ultra"];
export const RTK_MODE_VALUES: readonly RtkMode[] = ["off", "guidance", "auto", "rewrite"];
const FIELD_NAMES = [
  "codebaseMemoryEnabled",
  "codebaseMemoryAugmentHooks",
  "ponytailEnabled",
  "ponytailMode",
  "ponytailSubagents",
  "rtkMode",
  "rtkAutoInstall",
  "rtkCommand",
] as const;
export type MtmCodingField = (typeof FIELD_NAMES)[number];

export interface FieldState {
  readonly text: string;
  readonly overridden: boolean;
  readonly invalid: boolean;
}

export interface MtmCodingCardState {
  readonly available: boolean;
  readonly writable: boolean;
  readonly dirty: boolean;
  readonly invalid: boolean;
  readonly saving: boolean;
  readonly failed: boolean;
  readonly fields: Readonly<Record<MtmCodingField, FieldState>>;
}

export interface MtmCodingCardFace {
  readonly hooks: { mtmCodingCard: SnapshotStore<MtmCodingCardState> };
  readonly edit: (field: MtmCodingField, text: string) => void;
  readonly resetField: (field: MtmCodingField) => void;
  readonly save: () => void;
  readonly discard: () => void;
}

type StagedEdit = { readonly text: string; readonly clear: boolean };
type FieldValue = boolean | PonytailMode | RtkMode | string;

function format(field: MtmCodingField, value: unknown): string {
  if (field === "ponytailMode" || field === "rtkMode" || field === "rtkCommand") return typeof value === "string" ? value : "";
  return typeof value === "boolean" ? String(value) : "";
}

function parse(field: MtmCodingField, text: string): FieldValue | undefined {
  if (field === "ponytailMode") return MODE_VALUES.includes(text as PonytailMode) ? text as PonytailMode : undefined;
  if (field === "rtkMode") return RTK_MODE_VALUES.includes(text as RtkMode) ? text as RtkMode : undefined;
  if (field === "rtkCommand") return text;
  if (text === "true" || text === "false") return text === "true";
  return undefined;
}

function valueOf(snapshot: ReturnType<SettingsScope<MtmCodingSettings>["getSnapshot"]>, field: MtmCodingField): unknown {
  return (snapshot.value as Record<string, unknown> | undefined)?.[field];
}

function baseOf(snapshot: ReturnType<SettingsScope<MtmCodingSettings>["getSnapshot"]>, field: MtmCodingField): unknown {
  return (snapshot.base as Record<string, unknown> | undefined)?.[field];
}

function userHas(snapshot: ReturnType<SettingsScope<MtmCodingSettings>["getSnapshot"]>, field: MtmCodingField): boolean {
  const user = snapshot.user as Record<string, unknown> | undefined;
  return user !== undefined && Object.hasOwn(user, field);
}

/** Staged settings form for the unified coding plugin. */
export class MtmCodingCardController {
  private readonly staged = new Map<MtmCodingField, StagedEdit>();
  private readonly store: SnapshotStore<MtmCodingCardState>;
  private saving = false;
  private failed = false;
  private disposed = false;
  private readonly unsubscribe: () => void;

  constructor(private readonly scope: SettingsScope<MtmCodingSettings>) {
    this.store = createSnapshotStore(this.projection());
    this.unsubscribe = scope.subscribe(() => { this.publish(); });
  }

  inject(): MtmCodingCardFace {
    return {
      hooks: { mtmCodingCard: this.store },
      edit: (field, text) => { this.edit(field, text); },
      resetField: (field) => { this.resetField(field); },
      save: () => { void this.save(); },
      discard: () => { this.discard(); },
    };
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe();
  }

  private edit(field: MtmCodingField, text: string): void {
    this.staged.set(field, { text, clear: false });
    this.failed = false;
    this.publish();
  }

  private resetField(field: MtmCodingField): void {
    const snapshot = this.scope.getSnapshot();
    this.staged.set(field, { text: format(field, baseOf(snapshot, field)), clear: true });
    this.failed = false;
    this.publish();
  }

  private discard(): void {
    this.staged.clear();
    this.failed = false;
    this.publish();
  }

  private async save(): Promise<void> {
    const plan = this.plan();
    const writes = plan.flatMap(item => item.run === undefined ? [] : [item.run]);
    if (this.saving || this.staged.size === 0 || writes.length !== plan.length) return;
    this.saving = true;
    this.failed = false;
    this.publish();
    let landed = true;
    for await (const write of writes) {
      try {
        landed = await write() && landed;
      } catch {
        landed = false;
      }
    }
    if (landed) this.staged.clear();
    this.saving = false;
    this.failed = !landed;
    this.publish();
  }

  private plan(): Array<{ field: MtmCodingField; run: (() => Promise<boolean>) | undefined }> {
    const snapshot = this.scope.getSnapshot();
    const plan: Array<{ field: MtmCodingField; run: (() => Promise<boolean>) | undefined }> = [];
    for (const [field, edit] of this.staged) {
      if (edit.clear) {
        if (userHas(snapshot, field)) plan.push({ field, run: () => this.clear(field) });
        continue;
      }
      const current = format(field, valueOf(snapshot, field));
      if (edit.text === current) continue;
      const value = parse(field, edit.text);
      plan.push({ field, run: value === undefined ? undefined : () => this.writeValue(field, value) });
    }
    return plan;
  }

  private async clear(field: MtmCodingField): Promise<boolean> {
    await this.scope.unset(field);
    return !userHas(this.scope.getSnapshot(), field);
  }

  private async writeValue(field: MtmCodingField, value: FieldValue): Promise<boolean> {
    await this.scope.set(field, value);
    const snapshot = this.scope.getSnapshot();
    const user = snapshot.user as Record<string, unknown> | undefined;
    return user !== undefined && Object.hasOwn(user, field) && Object.is(user[field], value);
  }

  private field(field: MtmCodingField): FieldState {
    const snapshot = this.scope.getSnapshot();
    const staged = this.staged.get(field);
    if (staged === undefined) {
      return {
        text: format(field, valueOf(snapshot, field)),
        overridden: userHas(snapshot, field),
        invalid: false,
      };
    }
    return {
      text: staged.text,
      overridden: staged.clear ? false : parse(field, staged.text) !== undefined,
      invalid: !staged.clear && parse(field, staged.text) === undefined,
    };
  }

  private projection(): MtmCodingCardState {
    const snapshot = this.scope.getSnapshot();
    const fields = Object.fromEntries(FIELD_NAMES.map(field => [field, this.field(field)])) as Record<MtmCodingField, FieldState>;
    const plan = this.plan();
    return {
      available: snapshot.status === "ready",
      writable: snapshot.writable,
      dirty: plan.length > 0 || this.staged.size > 0,
      invalid: plan.some(item => item.run === undefined),
      saving: this.saving,
      failed: this.failed,
      fields,
    };
  }

  private publish(): void {
    if (this.disposed) return;
    this.store.set(this.projection());
  }
}
