import type { MtmCodingSettings } from "../coding/types.js";

export type MtmHarnessCapabilityStatus =
  | "available"
  | "read-only"
  | "unavailable"
  | "error";

export interface MtmHarnessCapabilitySnapshot {
  readonly status: MtmHarnessCapabilityStatus;
  readonly message?: string;
}

export interface MtmHarnessCapability {
  readonly getSnapshot: () => MtmHarnessCapabilitySnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

export type MtmHarnessSettingsField =
  | "codebaseMemoryEnabled"
  | "codebaseMemoryAugmentHooks"
  | "ponytailEnabled"
  | "ponytailMode"
  | "ponytailSubagents"
  | "rtkMode";

export type MtmHarnessSettingsValue = Pick<
  MtmCodingSettings,
  MtmHarnessSettingsField
>;

export interface MtmHarnessSettingsSnapshot
  extends MtmHarnessCapabilitySnapshot {
  readonly value?: Partial<MtmHarnessSettingsValue>;
  readonly user?: Partial<MtmHarnessSettingsValue>;
  readonly writable: boolean;
}

export interface MtmHarnessSettingsCapability {
  readonly getSnapshot: () => MtmHarnessSettingsSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  readonly set: <K extends MtmHarnessSettingsField>(
    field: K,
    value: MtmHarnessSettingsValue[K],
  ) => Promise<void>;
  readonly unset: (field: MtmHarnessSettingsField) => Promise<void>;
}

export const SETTINGS_FIELDS: readonly MtmHarnessSettingsField[] = [
  "codebaseMemoryEnabled",
  "codebaseMemoryAugmentHooks",
  "ponytailEnabled",
  "ponytailMode",
  "ponytailSubagents",
  "rtkMode",
];
