const ADMIN_APP_URL = "https://unpkg.com/mtm-admin@0.1.1/dist/standalone/index.html";

export interface MtmharnessFrontendExtensionContext {
  readonly apiVersion: 1;
  readonly id: string;
  readonly version: string;
  readonly root: HTMLElement;
  readonly document: Document;
  readonly signal: AbortSignal;
  readonly registerCleanup: (cleanup: () => void | Promise<void>) => void;
}

/** Mount a token-free entry point for the independent Admin application. */
export function mount(context: MtmharnessFrontendExtensionContext): () => void {
  const root = context.root;
  const previousStyle = root.getAttribute("style");
  const previousHidden = root.hidden;
  const link = context.document.createElement("a");
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    context.signal.removeEventListener("abort", dispose);
    link.remove();
    root.hidden = previousHidden;
    if (previousStyle === null) root.removeAttribute("style");
    else root.setAttribute("style", previousStyle);
  };

  link.href = ADMIN_APP_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Open MTM Admin";
  link.setAttribute("aria-label", "Open MTM Admin");
  link.dataset.mtmAdminLauncher = "true";
  link.style.display = "inline-flex";
  link.style.alignItems = "center";
  link.style.border = "1px solid #cbd5e1";
  link.style.borderRadius = "6px";
  link.style.background = "#ffffff";
  link.style.color = "#0f172a";
  link.style.padding = "8px 12px";
  link.style.font = "600 14px system-ui, sans-serif";
  link.style.textDecoration = "none";
  root.style.position = "fixed";
  root.style.right = "16px";
  root.style.bottom = "16px";
  root.style.zIndex = "2147483000";
  root.append(link);
  context.signal.addEventListener("abort", dispose, { once: true });
  context.registerCleanup(dispose);
  return dispose;
}
