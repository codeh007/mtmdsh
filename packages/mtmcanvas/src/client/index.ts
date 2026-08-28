import { createElement, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { CanvasView } from "./CanvasView.tsx";
import { CanvasRuntime } from "./runtime.ts";
import { MTM_CANVAS_CSS } from "./styles.ts";

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

function CanvasExtension({ runtime }: { runtime: CanvasRuntime }) {
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  return createElement(CanvasView, { state, actions: runtime });
}

/** Mount the browser-only Canvas experiment through the mtmharness ABI. */
export function mount(context: MtmharnessFrontendExtensionContext): () => void {
  const runtime = new CanvasRuntime();
  let reactRoot: ReturnType<typeof createRoot> | undefined;
  let style: HTMLStyleElement | undefined;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    context.signal.removeEventListener("abort", dispose);
    runtime.dispose();
    reactRoot?.unmount();
    style?.remove();
  };
  context.registerCleanup(dispose);
  try {
    context.root.style.position = "fixed";
    context.root.style.inset = "16px";
    context.root.style.zIndex = "1000";
    context.root.style.overflow = "hidden";
    context.root.style.border = "1px solid #cbd5e1";
    context.root.style.borderRadius = "8px";
    context.root.style.background = "#f8fafc";
    context.root.style.boxShadow = "0 16px 40px #17203333";
    style = context.document.createElement("style");
    style.dataset.mtmSecondaryExtension = context.id;
    style.textContent = MTM_CANVAS_CSS;
    context.document.head.append(style);
    reactRoot = createRoot(context.root);
    context.signal.addEventListener("abort", dispose, { once: true });
    reactRoot.render(createElement(CanvasExtension, { runtime }));
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
