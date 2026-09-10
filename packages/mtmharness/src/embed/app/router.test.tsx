import { createBrowserHistory } from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";
import { createPresentationController, normalizeConfig, resolveStandaloneBasepath } from "@/app/config";
import { MtmHarnessRuntime } from "@/runtime";
import { createClientRouter } from "./router";

const config = normalizeConfig({ apiOrigin: "https://api.example.test" });

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("client router history", () => {
  it("derives a relative CDN basepath from the current app URL", () => {
    expect(resolveStandaloneBasepath("./", "https://cdn.example.test/npm/mtmharness/dist/standalone/index.html")).toBe("/npm/mtmharness/dist/standalone");
    expect(resolveStandaloneBasepath("./", "https://cdn.example.test/npm/mtmharness/dist/standalone/workspace")).toBe("/npm/mtmharness/dist/standalone");
    expect(resolveStandaloneBasepath("/", "https://app.example.test/workspace")).toBeUndefined();
  });

  it("keeps standalone routes addressable below the static app base", async () => {
    window.history.replaceState({}, "", "/mtmharness/");
    const history = createBrowserHistory();
    const runtime = new MtmHarnessRuntime(config.apiOrigin);
    const router = createClientRouter({
      config,
      runtime,
      presentation: "standalone",
      basepath: "/mtmharness",
      history,
      presentationController: createPresentationController(config.mode),
    });

    await router.navigate({ to: "/" });
    await router.navigate({ to: "/workspace" });
    expect(window.location.pathname).toBe("/mtmharness/workspace");
    expect(history.location.pathname).toBe("/mtmharness/workspace");
    expect(history.canGoBack()).toBe(true);

    history.destroy();
    runtime.dispose();
  });

  it("matches a standalone workspace deep link on initial load", async () => {
    window.history.replaceState({}, "", "/mtmharness/workspace");
    const history = createBrowserHistory();
    const runtime = new MtmHarnessRuntime(config.apiOrigin);
    const router = createClientRouter({
      config,
      runtime,
      presentation: "standalone",
      basepath: "/mtmharness",
      history,
      presentationController: createPresentationController(config.mode),
    });

    await router.load();
    expect(router.state.location.pathname).toBe("/workspace");
    expect(window.location.pathname).toBe("/mtmharness/workspace");

    history.destroy();
    runtime.dispose();
  });

  it("keeps embed navigation in memory history", async () => {
    window.history.replaceState({}, "", "/host/page");
    const runtime = new MtmHarnessRuntime(config.apiOrigin);
    const router = createClientRouter({ config, runtime, presentation: "embed", presentationController: createPresentationController(config.mode) });

    await router.navigate({ to: "/workspace" });
    expect(router.history.location.pathname).toBe("/workspace");
    expect(window.location.pathname).toBe("/host/page");

    router.history.destroy();
    runtime.dispose();
  });
});
