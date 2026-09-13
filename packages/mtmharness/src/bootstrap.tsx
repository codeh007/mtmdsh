import {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  type RouterHistory,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { MtmHarnessApp } from "./app/app.js";
import { createAuthCoordinator } from "./app/auth.js";
import {
  createPresentationController,
  createTokenSource,
  type MtmHarnessClientConfig,
  type MtmHarnessClientHandle,
  normalizeConfig,
  resolveTarget,
} from "./app/config.js";
import { createClientRouter } from "./app/router.js";
import { MtmP2pClient } from "./features/p2p/client.js";
import { MtmHarnessRuntime } from "./runtime.js";
import appStyles from "./styles/globals.css?inline";

const mountedRoots = new WeakMap<Element, MtmHarnessClientHandle>();

function createHistory(
  config: ReturnType<typeof normalizeConfig>,
): RouterHistory {
  if (config.history !== undefined) return config.history;
  if (config.historyMode === "browser") return createBrowserHistory();
  if (config.historyMode === "hash") return createHashHistory();
  return createMemoryHistory({ initialEntries: ["/"] });
}

function mountClient(config: MtmHarnessClientConfig): MtmHarnessClientHandle {
  const normalizedConfig = normalizeConfig(config);
  const target = resolveTarget(config.target);
  const existing = mountedRoots.get(target);
  if (existing !== undefined) return existing;
  if (
    [...target.children].some(
      (element) => element.getAttribute("data-mtmharness-root") === "true",
    )
  )
    throw new Error("mtmharness is already mounted in this target");

  const presentationController = createPresentationController(
    normalizedConfig.mode,
  );
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  const container = document.createElement("div");
  host.dataset.mtmharness = "true";
  host.dataset.mtmharnessRoot = "true";
  style.textContent =
    appStyles +
    "\n:host { --font-sans: ui-sans-serif, system-ui, sans-serif; }";
  shadowRoot.append(style, container);
  target.append(host);

  const syncTheme = (): void => {
    host.classList.toggle(
      "dark",
      document.documentElement.classList.contains("dark") ||
        document.body?.classList.contains("dark") === true,
    );
  };
  syncTheme();
  const observer = new MutationObserver(syncTheme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  if (document.body)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["class"],
    });

  const tokenSource = createTokenSource(normalizedConfig);
  const auth = createAuthCoordinator(tokenSource);
  const runtime = new MtmHarnessRuntime(normalizedConfig.apiOrigin, {
    tokenSource,
    webSocketFactory: normalizedConfig.webSocketFactory,
  });
  const p2p = new MtmP2pClient(normalizedConfig.p2p);
  const router = createClientRouter({
    config: normalizedConfig,
    runtime,
    history: createHistory(normalizedConfig),
    auth,
    dsh: normalizedConfig.dsh,
    p2p,
    p2pBootstrapAddress: normalizedConfig.p2pBootstrapAddress,
    presentationController,
  });
  void auth.ready.then(() => {
    const target = auth.getReturnTarget();
    if (target !== undefined && auth.getSnapshot().status === "authenticated")
      void router.navigate({ to: target as never });
  });
  const root = createRoot(container);
  root.render(<MtmHarnessApp router={router} auth={auth} />);
  let mounted = true;
  const handle: MtmHarnessClientHandle = {
    open: presentationController.open,
    close: presentationController.close,
    openFullShell: presentationController.openFullShell,
    navigate: (route) => router.navigate({ to: route }),
    openP2p: () => router.navigate({ to: "/p2p" }),
    unmount() {
      if (!mounted) return;
      mounted = false;
      mountedRoots.delete(target);
      root.unmount();
      router.history.destroy();
      runtime.dispose();
      void p2p.close();
      if (normalizedConfig.dsh?.getSnapshot().status === "active")
        void normalizedConfig.dsh.disable();
      auth.dispose();
      observer.disconnect();
      host.remove();
    },
  };
  mountedRoots.set(target, handle);
  return handle;
}

export function bootstrap(
  config: MtmHarnessClientConfig,
): MtmHarnessClientHandle {
  return mountClient(config);
}

export const mount = bootstrap;

export function autoMount(
  script: HTMLScriptElement,
): MtmHarnessClientHandle | null {
  const apiOrigin = script.dataset.apiOrigin;
  if (!apiOrigin) return null;
  const runtimeBootstrap = window.__MTM_HARNESS_CONFIG__ ?? {};
  const oauthValues = [
    script.dataset.oauthIssuer,
    script.dataset.oauthClientId,
    script.dataset.oauthRedirectUri,
    script.dataset.oauthResource,
    script.dataset.oauthScopes,
  ];
  const hasOAuthAttributes = oauthValues.some((value) => value !== undefined);
  if (hasOAuthAttributes && oauthValues.some((value) => value === undefined))
    throw new TypeError("OAuth data attributes must be provided together");
  const oauth = hasOAuthAttributes
    ? {
        issuer: oauthValues[0]!,
        clientId: oauthValues[1]!,
        redirectUri: oauthValues[2]!,
        resource: oauthValues[3]!,
        scopes: oauthValues[4]!.split(/\s+/u),
      }
    : runtimeBootstrap.oauth;
  const handle = bootstrap({
    apiOrigin,
    oauth,
    accessToken: runtimeBootstrap.accessToken,
    tokenSource: runtimeBootstrap.tokenSource,
    webSocketFactory: runtimeBootstrap.webSocketFactory,
    p2p: runtimeBootstrap.p2p,
    p2pBootstrapAddress: runtimeBootstrap.p2pBootstrapAddress,
    dsh: runtimeBootstrap.dsh,
    mode: script.dataset.mode as MtmHarnessClientConfig["mode"] | undefined,
    target: script.dataset.target,
  });
  script.dataset.mtmharnessMounted = "true";
  return handle;
}

export const MtmHarnessClient = { autoMount, bootstrap, mount };

declare global {
  interface Window {
    MtmHarnessClient?: typeof MtmHarnessClient;
  }
}

function findAutoMountScript(): HTMLScriptElement | undefined {
  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.dataset.apiOrigin)
    return current;
  return [...document.scripts]
    .reverse()
    .find(
      (script) =>
        script.dataset.apiOrigin && script.dataset.mtmharnessMounted !== "true",
    );
}

if (typeof window !== "undefined") {
  window.MtmHarnessClient = MtmHarnessClient;
  const script = findAutoMountScript();
  if (script) {
    const handle = autoMount(script);
    if (handle) script.dataset.mtmharnessMounted = "true";
  }
}
