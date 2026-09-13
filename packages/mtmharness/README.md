# mtmharness

mtmharness is a browser-first React application with optional DSH integration. The package root and ./client remain static DSH graph entries for hosts; they are not the browser app startup path.

The client entry owns the browser P2P feature and coding settings inside the mtmharness fiber. Canvas is a separate `mtmcanvas` plugin and is not composed, configured, or loaded by this package. All registrations, styles, listeners, and clients owned by mtmharness are disposed with its Cordis fiber.

The Modern Go Guidelines wrapper uses the pinned upstream CLI with standard go install and user cache behavior. It never creates a project-local cache or overrides the active DSH file policy.

## DSH Web Plugin

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

This installs only mtmharness. Install mtmcanvas separately when the Canvas overlay is needed. Restart the DSH Web host after changing profile composition.

## Browser App

The package exposes browser bundles at dist/mtmharness.js (ESM) and dist/mtmharness.iife.js (IIFE). The ./embed entry exposes bootstrap/mount, MtmHarnessApp, the route contract, P2P client types, and the optional host-owned DSH bridge. Configure the API origin and pre-registered public OAuth client before the embed script runs:

    <script>
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
    </script>

Use the ESM export from an application build:

    import { bootstrap } from "mtmharness/embed";

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

The embed uses memory history by default and never changes the host page URL. mode: "fullscreen" defaults to hash history; historyMode: "browser" selects browser history for an independent harness. Every mode mounts one owned root inside an open ShadowRoot, and unmount removes its DOM, styles, observers, router, runtime, auth source, and P2P client.

Declarative auto-mounting accepts only non-sensitive data-api-origin, data-mode, and data-target attributes. OAuth attributes must be provided together. It never reads a token from markup.

The shared route tree contains /, /workspace, and /p2p. The P2P route shows node identity, worker/bootstrap/discovery state, peers and protocols, connect/disconnect controls, and bounded HTTP-over-P2P request, response, timeout, and cancellation errors.

The reusable browser OAuth client uses discovery-first OAuth/OIDC Authorization Code + PKCE (S256). Issuer, client ID, exact redirect URI, resource, scopes, HTTPS endpoints, and provider capabilities are validated before authorization. Production clients and redirect URIs must be registered by the provider.

Access and refresh tokens live only in JavaScript memory. The short-lived PKCE transaction is removed on every callback path. Tokens, roles, and capabilities are never put in markup, localStorage, or logs.

HTTP resource calls and revocation use an Authorization: Bearer header with credentials: omit. Session and streaming operations remain unavailable until their protected canonical contracts are implemented.

A host may pass an explicit dsh bridge to the browser bootstrap. The bridge exposes only observable unavailable, loading, active, failed, and disposing states plus enable()/disable(); the host owns the real Cordis Loader/fiber lifecycle. The app never imports or calls either static apply(ctx) entry.

The official DSH plugin keeps the host FullShell and local session untouched.

## Development

    pnpm install
    pnpm exec turbo run typecheck test --filter=mtmharness...
