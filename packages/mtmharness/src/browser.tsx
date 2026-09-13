export { MtmHarnessApp } from "./app/app.js";
export type {
  MtmHarnessClientConfig,
  MtmHarnessClientHandle,
  MtmHarnessClientMode,
  MtmHarnessHistoryMode,
  MtmHarnessPresentationController,
  MtmHarnessPresentationState,
  MtmHarnessRoute,
  MtmHarnessRuntimeBootstrap,
  MtmHarnessWebSocketFactory,
  NormalizedClientConfig,
} from "./app/config.js";
export type { MtmHarnessAuthCoordinator } from "./app/auth.js";
export { P2pDebugView } from "./app/p2p-route.js";
export { autoMount, bootstrap, mount, MtmHarnessClient } from "./bootstrap.js";
export { MtmP2pClient } from "./features/p2p/client.js";
export type { P2pClientOptions } from "./features/p2p/client.js";
export type {
  MtmHarnessCapability,
  MtmHarnessCapabilitySnapshot,
  MtmHarnessCapabilityStatus,
  MtmHarnessSettingsCapability,
  MtmHarnessSettingsField,
  MtmHarnessSettingsSnapshot,
  MtmHarnessSettingsValue,
} from "./features/settings/contract.js";
export { MtmHarnessSettingsView } from "./features/settings/view.js";
export type {
  MtmHarnessDshIntegrationBridge,
  MtmHarnessDshIntegrationSnapshot,
  MtmHarnessDshIntegrationStatus,
  MtmHarnessHostCapabilities,
} from "./host/contract.js";
