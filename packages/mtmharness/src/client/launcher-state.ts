export type LauncherState = { open: boolean; nonce?: string; ready: boolean; height: number; error?: string };

const CLOSED_STATE: LauncherState = { open: false, ready: false, height: 640 };
let state: LauncherState = CLOSED_STATE;
const listeners = new Set<() => void>();

export function snapshot(): LauncherState { return state; }
export function subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; }

export function publish(next: LauncherState): void { state = next; for (const listener of listeners) listener(); }

function createNonce(): string {
  const secureCrypto = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
  const randomUuid = (secureCrypto as (Crypto & { randomUUID?: () => string }) | undefined)?.randomUUID;
  if (typeof randomUuid === "function") return randomUuid.call(secureCrypto);
  if (secureCrypto === undefined) throw new Error("Secure randomness is unavailable");
  const bytes = new Uint8Array(32);
  secureCrypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function openMtmHarnessLauncher(): void {
  publish({ open: true, nonce: createNonce(), ready: false, height: 640 });
}

export function closeMtmHarnessLauncher(): void {
  if (state.open) publish(CLOSED_STATE);
}

export function disposeMtmHarnessLauncher(): void {
  state = CLOSED_STATE;
  for (const listener of listeners) listener();
}
