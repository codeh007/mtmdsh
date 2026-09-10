import { createElement, useSyncExternalStore } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";
import { ConnectView } from "./ConnectView.tsx";
import { ConnectRuntime } from "./runtime.ts";
import { MTM_CONNECT_CSS } from "./styles.ts";

export interface MtmConnectClientConfig { enabled?: boolean; }
export interface MtmConnectClientSnapshot { desired: boolean; status: "disabled" | "enabled" | "loading" | "failed"; error?: string; }

export class MtmConnectClient {
  private readonly runtime = new ConnectRuntime();
  private readonly stopRuntime: () => void;
  private desired: boolean;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(config: MtmConnectClientConfig = {}) {
    this.desired = config.enabled ?? true;
    this.stopRuntime = this.runtime.subscribe(() => this.publish());
  }
  getSnapshot = (): MtmConnectClientSnapshot => ({ desired: this.desired, status: this.desired ? "enabled" : "disabled" });
  getViewState = this.runtime.getSnapshot;
  getActions = (): ConnectRuntime => this.runtime;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setEnabled = async (enabled: boolean): Promise<void> => { if (!this.disposed && this.desired !== enabled) { this.desired = enabled; this.publish(); } };
  show = (_focusSelector?: string): void => { void this.setEnabled(true); };
  hide = (): void => { void this.setEnabled(false); };
  dispose = (): void => { if (this.disposed) return; this.disposed = true; this.stopRuntime(); this.runtime.dispose(); this.listeners.clear(); };
  private publish(): void { for (const listener of [...this.listeners]) listener(); }
}

function ConnectOverlay({ client }: { client: MtmConnectClient }) {
  const visible = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot).desired;
  if (!visible) return null;
  return createElement(ConnectView, { state: client.getViewState(), actions: client.getActions(), onClose: client.hide });
}

type SlotContext = ClientContext & { slots: { inject(name: string, register: () => unknown): unknown; register(options: Record<string, unknown>, component: unknown): unknown } };

export const inject = ["slots"];

export function apply(ctx: ClientContext, config: MtmConnectClientConfig = {}): void {
  const client = new MtmConnectClient(config);
  const slots = (ctx as SlotContext).slots;
  ctx.provide("mtm-connect-client", client);
  ctx.effect(() => () => { client.dispose(); }, "mtm-connect: client lifecycle");
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {};
    const style = document.createElement("style");
    style.dataset.plugin = "mtm-connect";
    style.textContent = MTM_CONNECT_CSS;
    document.head.append(style);
    return () => { style.remove(); };
  }, "mtm-connect: styles");
  slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "mtm-connect", order: 40 }, () => createElement(ConnectOverlay, { client })));
}
