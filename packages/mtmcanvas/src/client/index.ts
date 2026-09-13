import type { Context as ClientContext } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-layout/client";
import type {} from "@deepseek-ai/dsh-client-ui-renderer/client";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import { createElement, useSyncExternalStore } from "react";
import { CanvasView } from "./CanvasView.js";
import { CanvasRuntime } from "./runtime.js";
import { MTM_CANVAS_CSS } from "./styles.js";

export interface MtmCanvasClientConfig {
  enabled?: boolean;
}
export interface MtmCanvasClientSnapshot {
  desired: boolean;
  status: "disabled" | "enabled" | "loading" | "failed";
  error?: string;
}

export class MtmCanvasClient {
  private readonly runtime = new CanvasRuntime();
  private readonly stopRuntime: () => void;
  private desired: boolean;
  private disposed = false;
  private readonly listeners = new Set<() => void>();
  constructor(config: MtmCanvasClientConfig = {}) {
    this.desired = config.enabled ?? true;
    this.stopRuntime = this.runtime.subscribe(() => this.publish());
  }
  getSnapshot = (): MtmCanvasClientSnapshot => ({
    desired: this.desired,
    status: this.desired ? "enabled" : "disabled",
  });
  getViewState = this.runtime.getSnapshot;
  getActions = (): CanvasRuntime => this.runtime;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setEnabled = async (enabled: boolean): Promise<void> => {
    if (!this.disposed && this.desired !== enabled) {
      this.desired = enabled;
      this.publish();
    }
  };
  dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.stopRuntime();
    this.runtime.dispose();
    this.listeners.clear();
  };
  private publish(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

function CanvasOverlay({ client }: { client: MtmCanvasClient }) {
  const visible = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getSnapshot,
  ).desired;
  if (!visible) return null;
  return createElement(CanvasView, {
    state: client.getViewState(),
    actions: client.getActions(),
  });
}

export const inject = ["slots"];

export function apply(
  ctx: ClientContext,
  config: MtmCanvasClientConfig = {},
): void {
  const client = new MtmCanvasClient(config);
  ctx.provide("mtmcanvas-client", client);
  ctx.effect(
    () => () => {
      client.dispose();
    },
    "mtmcanvas: client lifecycle",
  );
  ctx.effect(() => {
    if (typeof document === "undefined") return () => {};
    const style = document.createElement("style");
    style.dataset.plugin = "mtmcanvas";
    style.textContent = MTM_CANVAS_CSS;
    document.head.append(style);
    return () => {
      style.remove();
    };
  }, "mtmcanvas: styles");
  ctx.slots.inject("shell.overlay", () =>
    ctx.slots.register(
      { name: "shell.overlay", id: "mtmcanvas", order: 30 },
      () => createElement(CanvasOverlay, { client }),
    ),
  );
}
