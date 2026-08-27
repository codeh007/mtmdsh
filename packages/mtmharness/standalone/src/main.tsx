import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { createClientRouter } from "@/app/router";
import { createTokenSource, normalizeConfig, resolveStandaloneBasepath } from "@/app/config";
import type { MtmHarnessAuthClient } from "@/app/auth";
import { DEFAULT_ALLOWED_PARENT_ORIGINS, installHostBridge } from "@/app/host-bridge";
import { MtmHarnessRuntime } from "@/runtime";
import "@/styles/globals.css";

const container = document.querySelector("#app");
if (!container) throw new Error("standalone app root is missing");

const bootstrap = window.__MTM_HARNESS_CONFIG__ ?? {};
const config = normalizeConfig({
  apiOrigin: bootstrap.apiOrigin ?? import.meta.env.VITE_API_ORIGIN ?? window.location.origin,
  oauth: bootstrap.oauth,
  accessToken: bootstrap.accessToken,
  tokenSource: bootstrap.tokenSource,
  webSocketFactory: bootstrap.webSocketFactory,
  allowedParentOrigins: bootstrap.allowedParentOrigins ?? DEFAULT_ALLOWED_PARENT_ORIGINS,
  mode: "fullscreen",
});
const tokenSource = createTokenSource(config);
const auth = tokenSource !== undefined && "consumeCallback" in tokenSource ? tokenSource as MtmHarnessAuthClient : undefined;
const runtime = new MtmHarnessRuntime(config.apiOrigin, {
  tokenSource,
  webSocketFactory: config.webSocketFactory,
});
const bridge = installHostBridge({ allowedParentOrigins: config.allowedParentOrigins });
if (auth !== undefined) {
  void auth.consumeCallback().then((consumed) => consumed ? runtime.refreshRegistry().catch(() => undefined) : undefined).catch(() => undefined);
}
const basepath = resolveStandaloneBasepath(import.meta.env.BASE_URL, window.location.href);
const router = createClientRouter({
  config,
  runtime,
  presentation: "standalone",
  basepath,
  history: createBrowserHistory(),
  auth,
});
const root = createRoot(container);
let disposed = false;
const dispose = (): void => {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("pagehide", dispose);
  root.unmount();
  router.history.destroy();
  bridge.dispose();
  runtime.dispose();
  auth?.dispose({ preserveAuthorization: false });
};
window.addEventListener("pagehide", dispose);
import.meta.hot?.dispose(dispose);
root.render(<RouterProvider router={router} />);
