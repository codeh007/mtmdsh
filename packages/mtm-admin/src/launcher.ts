import { createElement, useSyncExternalStore } from "react";
import type { Context as ClientContext } from "@deepseek-ai/cordis";

export interface MtmAdminClientConfig { enabled?: boolean; appUrl?: string; }
export interface MtmAdminClientSnapshot { desired: boolean; status: "disabled" | "enabled" | "loading" | "failed"; error?: string; }

export class MtmAdminClient {
  private readonly appUrl: string;
  private desired: boolean;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(config: MtmAdminClientConfig = {}) {
    this.desired = config.enabled ?? false;
    this.appUrl = config.appUrl ?? "/admin/";
    if (!/^https?:\/\//u.test(this.appUrl) && !this.appUrl.startsWith("/")) throw new TypeError("mtm-admin appUrl must be an absolute URL or root path");
  }
  getSnapshot = (): MtmAdminClientSnapshot => ({ desired: this.desired, status: this.desired ? "enabled" : "disabled" });
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  setEnabled = async (enabled: boolean): Promise<void> => { if (!this.disposed && this.desired !== enabled) { this.desired = enabled; this.publish(); } };
  show = (_focusSelector?: string): void => { void this.setEnabled(true); };
  hide = (): void => { void this.setEnabled(false); };
  dispose = (): void => { if (this.disposed) return; this.disposed = true; this.listeners.clear(); };
  getAppUrl = (): string => this.appUrl;
  private publish(): void { for (const listener of [...this.listeners]) listener(); }
}

function AdminOverlay({ client }: { client: MtmAdminClient }) {
  const visible = useSyncExternalStore(client.subscribe, client.getSnapshot, client.getSnapshot).desired;
  if (!visible) return null;
  return createElement("a", { href: client.getAppUrl(), target: "_blank", rel: "noopener noreferrer", "aria-label": "Open MTM Admin", "data-mtm-admin-launcher": "true" }, "Open MTM Admin");
}

type SlotContext = ClientContext & { slots: { inject(name: string, register: () => unknown): unknown; register(options: Record<string, unknown>, component: unknown): unknown } };

export const inject = ["slots"];

export function apply(ctx: ClientContext, config: MtmAdminClientConfig = {}): void {
  const client = new MtmAdminClient(config);
  const slots = (ctx as SlotContext).slots;
  ctx.provide("mtm-admin-client", client);
  ctx.effect(() => () => { client.dispose(); }, "mtm-admin: client lifecycle");
  slots.inject("shell.overlay", () => slots.register({ name: "shell.overlay", id: "mtm-admin", order: 50 }, () => createElement(AdminOverlay, { client })));
}
