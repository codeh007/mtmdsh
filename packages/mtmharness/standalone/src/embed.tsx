import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import embedStyles from "@/styles/globals.css?inline";
import { createClientRouter } from "@/app/router";
import { createPresentationController, createTokenSource, normalizeConfig, resolveTarget, type MtmHarnessClientConfig, type MtmHarnessClientHandle } from "./app/config";
import type { MtmHarnessAuthClient } from "./app/auth";
import { installHostBridge } from "./app/host-bridge";
import { MtmHarnessRuntime } from "@/runtime";

function mountClient(config: MtmHarnessClientConfig): MtmHarnessClientHandle {
  const normalizedConfig = normalizeConfig(config);
  const presentationController = createPresentationController(normalizedConfig.mode);
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

  const tokenSource = createTokenSource(normalizedConfig);
  const auth = tokenSource !== undefined && "consumeCallback" in tokenSource ? tokenSource as MtmHarnessAuthClient : undefined;
  const runtime = new MtmHarnessRuntime(normalizedConfig.apiOrigin, {
    tokenSource,
    webSocketFactory: normalizedConfig.webSocketFactory,
  });
  const bridge = installHostBridge({ allowedParentOrigins: normalizedConfig.allowedParentOrigins });
  if (auth !== undefined) {
    void auth.consumeCallback().then((consumed) => consumed ? runtime.refreshRegistry().catch(() => undefined) : undefined).catch(() => undefined);
  }
  const router = createClientRouter({
    config: normalizedConfig,
    runtime,
    presentation: "embed",
    history: createMemoryHistory({ initialEntries: ["/"] }),
    auth,
    presentationController,
  });
  const root = createRoot(container);
  root.render(<RouterProvider router={router} />);
  let mounted = true;
  return {
    open: presentationController.open,
    close: presentationController.close,
    openFullShell: presentationController.openFullShell,
    unmount() {
      if (!mounted) return;
      mounted = false;
      root.unmount();
      router.history.destroy();
      bridge.dispose();
      runtime.dispose();
      auth?.dispose();
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
  const oauthValues = [script.dataset.oauthIssuer, script.dataset.oauthClientId, script.dataset.oauthRedirectUri, script.dataset.oauthResource, script.dataset.oauthScopes];
  const hasOAuthAttributes = oauthValues.some((value) => value !== undefined);
  if (hasOAuthAttributes && oauthValues.some((value) => value === undefined)) throw new TypeError("OAuth data attributes must be provided together");
  const oauth = hasOAuthAttributes
    ? { issuer: oauthValues[0]!, clientId: oauthValues[1]!, redirectUri: oauthValues[2]!, resource: oauthValues[3]!, scopes: oauthValues[4]!.split(/\s+/u) }
    : bootstrap.oauth;
  const handle = mountClient({
    apiOrigin,
    oauth,
    accessToken: bootstrap.accessToken,
    tokenSource: bootstrap.tokenSource,
    webSocketFactory: bootstrap.webSocketFactory,
    allowedParentOrigins: bootstrap.allowedParentOrigins,
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
