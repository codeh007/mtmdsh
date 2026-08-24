import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import embedStyles from "@/styles/globals.css?inline";
import { createClientRouter } from "@/app/router";
import { normalizeConfig, resolveTarget, type MtmHarnessClientConfig, type MtmHarnessClientHandle } from "./app/config";
import { MtmHarnessRuntime } from "@/runtime";

function mountClient(config: MtmHarnessClientConfig): MtmHarnessClientHandle {
  const normalizedConfig = normalizeConfig(config);
  const target = resolveTarget(config.target);
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  const container = document.createElement("div");
  host.dataset.mtmharness = "true";
  style.textContent = embedStyles + "\n:host { --font-sans: ui-sans-serif, system-ui, sans-serif; }";
  shadowRoot.append(style, container);
  target.append(host);

  const syncTheme = (): void => {
    host.classList.toggle("dark", document.documentElement.classList.contains("dark") || document.body?.classList.contains("dark") === true);
  };
  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  const runtime = new MtmHarnessRuntime(normalizedConfig.apiOrigin, {
    accessToken: normalizedConfig.accessToken,
    webSocketFactory: normalizedConfig.webSocketFactory,
  });
  const router = createClientRouter({
    config: normalizedConfig,
    runtime,
    presentation: "embed",
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const root = createRoot(container);
  root.render(<RouterProvider router={router} />);
  let mounted = true;
  return {
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
      router.history.destroy();
      runtime.dispose();
      observer.disconnect();
      host.remove();
    },
  };
}

export function mount(config: MtmHarnessClientConfig): MtmHarnessClientHandle {
  return mountClient(config);
}

export function autoMount(script: HTMLScriptElement): MtmHarnessClientHandle | null {
  const apiOrigin = script.dataset.apiOrigin;
  if (!apiOrigin) return null;
  const bootstrap = window.__MTM_HARNESS_CONFIG__ ?? {};
  const handle = mountClient({
    apiOrigin,
    accessToken: script.dataset.accessToken ?? bootstrap.accessToken,
    webSocketFactory: bootstrap.webSocketFactory,
    mode: script.dataset.mode as MtmHarnessClientConfig["mode"] | undefined,
    target: script.dataset.target,
  });
  script.dataset.mtmharnessMounted = "true";
  return handle;
}

export const MtmHarnessClient = { autoMount, mount };

declare global {
  interface Window { MtmHarnessClient?: typeof MtmHarnessClient; }
}

function findAutoMountScript(): HTMLScriptElement | undefined {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.apiOrigin) return current;
  return [...document.scripts].reverse().find((script) => script.dataset.apiOrigin && script.dataset.mtmharnessMounted !== "true");
}

if (typeof window !== "undefined") {
  window.MtmHarnessClient = MtmHarnessClient;
  const script = findAutoMountScript();
  if (script) {
    const handle = autoMount(script);
    if (handle) script.dataset.mtmharnessMounted = "true";
  }
}
