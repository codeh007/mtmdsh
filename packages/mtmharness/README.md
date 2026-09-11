# mtmharness

mtmharness is one public npm package with one unified DSH plugin. The package root supplies the Host plugin, and ./client supplies the DSH Web client entry.

The client entry composes mtmcanvas and the internal browser P2P feature inside the mtmharness fiber. P2P is owned by this package and has no separate plugin or product overlay. All registrations, styles, listeners, and clients are disposed with the owning Cordis fiber.

The Modern Go Guidelines wrapper uses the pinned upstream CLI with standard go install and user cache behavior. It never creates a project-local cache or overrides the active DSH file policy.

## DSH Web Plugin

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Only mtmharness is installed as a DSH plugin. Restart the DSH Web host after changing profile composition.

## Embed

The package exposes an embed IIFE at dist/embed/mtmharness.iife.js and explicit ./embed and ./auth exports. Configure the API origin and pre-registered public OAuth client before the embed script runs:

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

    import { mount } from "mtmharness/embed";

    const handle = mount({ target: "#agent-panel", apiOrigin: "https://api.example.test", mode: "floating" });
    handle.open();
    handle.openFullShell();
    handle.close();
    handle.unmount();

The embed uses memory history and never changes the host page URL. It mounts inside an open ShadowRoot and removes its DOM, styles, observers, router, and runtime on unmount().

Declarative auto-mounting accepts only non-sensitive data-api-origin, data-mode, and data-target attributes. OAuth attributes must be provided together. It never reads a token from markup.

The reusable browser OAuth client uses discovery-first OAuth/OIDC Authorization Code + PKCE (S256). Issuer, client ID, exact redirect URI, resource, scopes, HTTPS endpoints, and provider capabilities are validated before authorization. Production clients and redirect URIs must be registered by the provider.

Access and refresh tokens live only in JavaScript memory. The short-lived PKCE transaction is removed on every callback path. Tokens, tickets, roles, and capabilities are never put in markup, localStorage, logs, or WebSocket URLs.

HTTP resource calls, revocation, and POST /api/dsh/ws-ticket use an Authorization: Bearer header with credentials: omit. Each socket requests a fresh v1 ticket and sends only the dsh.v1 and dsh-ticket protocols.

The official DSH plugin keeps the host FullShell and local session untouched.

## Development

    pnpm install
    pnpm --filter mtmharness run check
    pnpm --filter mtmharness run build
