import { validateAdapterDescriptor, type AdapterDescriptor } from "../contract/adapter.ts";

const MOCK_WORLD: AdapterDescriptor = {
  id: "mock-world",
  version: "0.1.0",
  label: "Mock workstation",
  summary: "A deterministic primary execution-world fixture.",
  status: "installed",
  kind: "mock-world",
  setupMethods: [{ id: "mock.setup", label: "Use fixture workspace", kind: "mock", status: "available" }],
  capabilities: [{
    id: "workspace.execution",
    version: "0.1.0",
    label: "Workspace and process view",
    role: "primary-world",
    eventKinds: ["workspace.changed", "process.exited"],
    operations: [
      { id: "workspace.list", label: "List fixture workspace", kind: "one-shot", sideEffect: "read", requiresApproval: false },
      { id: "process.list", label: "Inspect fixture processes", kind: "one-shot", sideEffect: "read", requiresApproval: false },
    ],
    limits: { maxInputBytes: 2_048, maxOutputBytes: 8_192 },
    supportedTargets: ["fixture-workstation"],
  }],
};

const MOCK_DEVICE: AdapterDescriptor = {
  id: "mock-device",
  version: "0.1.0",
  label: "Mock Android device",
  summary: "A deterministic additive device-capability fixture.",
  status: "installed",
  kind: "mock-device",
  setupMethods: [{ id: "mock.device.setup", label: "Pair fixture device", kind: "mock", status: "available" }],
  capabilities: [{
    id: "device.control",
    version: "0.1.0",
    label: "Screen and input control",
    role: "additive-capability",
    eventKinds: ["device.notification", "device.screen.changed"],
    operations: [
      { id: "screen.snapshot", label: "Capture fixture screen", kind: "one-shot", sideEffect: "read", requiresApproval: false },
      { id: "input.tap", label: "Tap fixture screen", kind: "one-shot", sideEffect: "write", requiresApproval: true },
    ],
    limits: { maxInputBytes: 2_048, maxOutputBytes: 8_192 },
    supportedTargets: ["fixture-android"],
  }],
};

function unavailable(
  id: string,
  label: string,
  summary: string,
  setup: { id: string; label: string; kind: "manual" | "device-code" | "oauth" },
): AdapterDescriptor {
  return {
    id,
    version: "0.1.0",
    label,
    summary,
    status: "unavailable",
    kind: "unavailable",
    setupMethods: [{ ...setup, status: "unavailable" }],
    capabilities: [],
    availabilityNote: "Adapter is listed for discovery only; the P0 release does not provide it.",
  };
}

const UNAVAILABLE: readonly AdapterDescriptor[] = [
  unavailable("ssh", "SSH host", "Remote Linux execution world.", { id: "ssh.credentials", label: "Enter host credentials", kind: "manual" }),
  unavailable("android", "Android device", "Device bridge and APK enrollment.", { id: "android.pair", label: "Pair with device code", kind: "device-code" }),
  unavailable("chrome", "Chrome extension", "Browser tab and profile capability.", { id: "chrome.oauth", label: "Authorize browser extension", kind: "oauth" }),
  unavailable("cloudflare-container", "Cloudflare container", "Managed remote execution world.", { id: "container.setup", label: "Configure container", kind: "manual" }),
];

export function createAdapterCatalog(): AdapterDescriptor[] {
  return [MOCK_WORLD, MOCK_DEVICE, ...UNAVAILABLE].map((descriptor) => validateAdapterDescriptor(JSON.parse(JSON.stringify(descriptor))));
}

export function installedAdapters(adapters: readonly AdapterDescriptor[]): AdapterDescriptor[] {
  return adapters.filter((adapter) => adapter.status === "installed");
}
