# mtmharness

mtmharness is a browser-first React application with optional DSH integration. The package root supplies the DSH Host plugin; the browser app owns its mount root, presentation, and navigation. The browser startup path is the explicit bootstrap/mount API, not a static Host or client apply entry.

The package does not register an mtmharness card in the DSH Settings page and does not implement package updates. In particular, it never reads a DSH profile from the filesystem or runs pnpm to update itself. A future DSH host may expose a narrow update capability; mtmharness will consume it only after that public contract exists.

## Browser App

The package exposes browser bundles at dist/mtmharness.js (ESM) and dist/mtmharness.iife.js (IIFE). The ./browser entry exposes bootstrap/mount, MtmHarnessApp, the route contract, P2P client types, the settings capability view, and the optional host-owned DSH bridge. Configure the API origin and pre-registered public OAuth client before the browser script runs:

    window.__MTM_HARNESS_CONFIG__ = {
      apiOrigin: "https://gomtm-dev.yuepa8.com",
      oauth: {
        issuer: "https://gomtm-dev.yuepa8.com",
        clientId: "<pre-registered-client-id>",
        redirectUri: "https://host.example.test/mtm/callback",
        resource: "https://gomtm-dev.yuepa8.com/api/dsh",
        scopes: ["openid", "dsh:connect"]
      }
    };

Use the ESM bootstrap API from an application build:

    import { bootstrap } from "mtmharness/browser";

    const handle = bootstrap({
      target: "#agent-panel",
      apiOrigin: "https://api.example.test",
      mode: "floating",
      p2p: { workerUrl: "/mtmharness/p2p-worker.js" },
      p2pBootstrapAddress: "/ip4/127.0.0.1/tcp/443/wss/p2p/<peer-id>"
    });
    handle.open();
    await handle.openP2p();
    handle.openFullShell();
    handle.close();
    handle.unmount();

Widget mounts use memory history and do not change the host page URL. Independent applications can use hash or browser history. Every mode mounts one owned root inside an open ShadowRoot, and unmount removes its DOM, styles, observers, router, runtime, auth source, and P2P client. The settings view accepts explicit capability objects for authentication, the remote product API, P2P, DSH-local actions, and browser-owned coding settings. Missing capabilities render as unavailable; errors are shown as errors.

The shared route tree contains /, /workspace, and /p2p. The P2P route shows node identity, worker/bootstrap/discovery state, peers and protocols, connect/disconnect controls, and bounded HTTP-over-P2P request, response, timeout, and cancellation errors.

The reusable browser OAuth client uses discovery-first OAuth/OIDC Authorization Code + PKCE (S256). Access and refresh tokens live only in JavaScript memory. HTTP resource calls use an Authorization: Bearer header with credentials omitted.

## DSH Web

Install mtmharness as a DSH host plugin when local coding capabilities are required:

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

The host plugin owns Codebase Memory, Modern Go, Ponytail, and RTK. These are DSH-local capabilities and are not automatically enabled by the browser app. A host may pass an explicit DSH bridge to the browser bootstrap. The bridge exposes only observable unavailable, loading, active, failed, and disposing states plus enable()/disable(); the host owns the real Cordis Loader/fiber lifecycle. The app never imports or calls either static apply(ctx) entry. Canvas is a separate mtmcanvas plugin.

## Development

    pnpm install
    pnpm --filter mtmharness typecheck
    pnpm --filter mtmharness build
    pnpm --filter mtmharness test
