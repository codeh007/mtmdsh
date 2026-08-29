import { createElement, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { ConnectView } from "./ConnectView.tsx";
import { ConnectRuntime } from "./runtime.ts";
import { MTM_CONNECT_CSS } from "./styles.ts";

export interface MtmharnessFrontendExtensionContext {
  readonly apiVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly root: HTMLElement;
  readonly document: Document;
  readonly signal: AbortSignal;
  readonly registerCleanup: (cleanup: () => void | Promise<void>) => void;
}

export type MtmharnessFrontendExtensionCleanup = void | (() => void | Promise<void>);

function ConnectExtension({ runtime, onClose }: { runtime: ConnectRuntime; onClose: () => void }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  return createElement(ConnectView, { state, actions: runtime, onClose });
}

/** Mount the browser-only mock Connect view through the mtmharness ABI. */
export function mount(context: MtmharnessFrontendExtensionContext): () => void {
  const runtime = new ConnectRuntime();
  let reactRoot: ReturnType<typeof createRoot> | undefined;
  let style: HTMLStyleElement | undefined;
  const previousStyle = context.root.getAttribute("style");
  const previousTabIndex = context.root.getAttribute("tabindex");
  const previousHidden = context.root.hidden;
  let disposed = false;
  const restoreRoot = (): void => {
    if (previousStyle === null) context.root.removeAttribute("style");
    else context.root.setAttribute("style", previousStyle);
    if (previousTabIndex === null) context.root.removeAttribute("tabindex");
    else context.root.setAttribute("tabindex", previousTabIndex);
    context.root.hidden = previousHidden;
  };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    context.signal.removeEventListener("abort", dispose);
    runtime.dispose();
    reactRoot?.unmount();
    style?.remove();
    restoreRoot();
  };
  context.registerCleanup(dispose);
  try {
    context.root.tabIndex = -1;
    context.root.style.position = "fixed";
    context.root.style.top = "16px";
    context.root.style.right = "16px";
    context.root.style.bottom = "16px";
    context.root.style.zIndex = "1000";
    context.root.style.width = "min(520px, calc(100vw - 32px))";
    context.root.style.overflow = "hidden";
    context.root.style.border = "1px solid #cbd5e1";
    context.root.style.borderRadius = "8px";
    context.root.style.background = "#f7f8fa";
    context.root.style.boxShadow = "0 16px 40px #17203333";
    style = context.document.createElement("style");
    style.dataset.mtmSecondaryExtension = context.id;
    style.textContent = MTM_CONNECT_CSS;
    context.document.head.append(style);
    const root = createRoot(context.root);
    reactRoot = root;
    context.signal.addEventListener("abort", dispose, { once: true });
    flushSync(() => {
      root.render(createElement(ConnectExtension, { runtime, onClose: () => { context.root.hidden = true; } }));
    });
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
