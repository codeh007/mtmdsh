import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { createClientRouter } from "@/app/router";
import { normalizeConfig, resolveStandaloneBasepath } from "@/app/config";
import { MtmHarnessRuntime } from "@/runtime";
import "@/styles/globals.css";

const container = document.querySelector("#app");
if (!container) throw new Error("standalone app root is missing");

const bootstrap = window.__MTM_HARNESS_CONFIG__ ?? {};
const config = normalizeConfig({
  apiOrigin: bootstrap.apiOrigin ?? import.meta.env.VITE_API_ORIGIN ?? window.location.origin,
  accessToken: bootstrap.accessToken,
  webSocketFactory: bootstrap.webSocketFactory,
  mode: "fullscreen",
});
const runtime = new MtmHarnessRuntime(config.apiOrigin, {
  accessToken: config.accessToken,
  webSocketFactory: config.webSocketFactory,
});
const basepath = resolveStandaloneBasepath(import.meta.env.BASE_URL, window.location.href);
const router = createClientRouter({
  config,
  runtime,
  presentation: "standalone",
  basepath,
  history: createBrowserHistory(),
});
const root = createRoot(container);
let disposed = false;
const dispose = (): void => {
  if (disposed) return;
  disposed = true;
  window.removeEventListener("pagehide", dispose);
  root.unmount();
  router.history.destroy();
  runtime.dispose();
};
window.addEventListener("pagehide", dispose);
import.meta.hot?.dispose(dispose);
root.render(<RouterProvider router={router} />);
