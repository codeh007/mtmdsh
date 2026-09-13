import type { P2pClientOptions } from "../features/p2p/client.js";

export type MtmHarnessDshIntegrationStatus =
  | "unavailable"
  | "loading"
  | "active"
  | "failed"
  | "disposing";

export interface MtmHarnessDshIntegrationSnapshot {
  readonly status: MtmHarnessDshIntegrationStatus;
  readonly error?: string;
}

/** Host-owned bridge. The host, not the browser app, owns Cordis lifecycle. */
export interface MtmHarnessDshIntegrationBridge {
  getSnapshot(): MtmHarnessDshIntegrationSnapshot;
  subscribe(listener: () => void): () => void;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

export interface MtmHarnessHostCapabilities {
  readonly dsh?: MtmHarnessDshIntegrationBridge;
  readonly p2p?: P2pClientOptions;
}
