# mtmharness

mtmharness is one public npm package with one unified DSH plugin. The package root supplies the Host plugin, and ./client supplies the single DSH Web client entry.

The client entry composes mtmcanvas, mtm-admin, and mtm-p2p inside the mtmharness fiber. Each package keeps its own source and capability boundary; none is declared as a second DSH plugin and none uses a secondary runtime protocol.

Coding features remain under the mtm-coding settings namespace. Dynamic Canvas controls the composed Canvas view, while Admin settings control the composed admin shell view. All registrations, styles, listeners, and clients are disposed with the owning Cordis fiber.

The Modern Go Guidelines wrapper uses the pinned upstream CLI with standard go install and user cache behavior. It never creates a project-local cache or overrides the active DSH file policy.

## DSH Web Plugin

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Only mtmharness is installed as a DSH plugin. Restart the DSH Web host after changing profile composition. DSH Web registers the shared launcher in `shell.overlay`.

## Static App and Embed

The package also publishes the independent static app and explicit embed/auth exports. Those surfaces own their React roots and OAuth lifecycle and are not part of the DSH client composition.

The package tarball contains the standalone app at `dist/standalone/index.html` and its hashed assets. Serve that directory as the static app root; the HTML uses relative asset URLs so it also works below a CDN or npm subpath. Configure the API origin and the pre-registered public OAuth client before the app script runs:

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
    <!-- Serve dist/standalone/index.html after this configuration. -->

The app uses browser history for direct navigation. The default CDN config derives the exact OAuth callback from the final origin and pathname, so unpkg's `@latest` redirect remains compatible with exact redirect registration. The deployment authority must register that resolved URI, not a wildcard. A deployment must serve `index.html` for the app's routes and provide the CSP/frame-ancestors HTTP headers described by the static HTML contract.

Use the ESM export from an application build:

    import { mount } from "mtmharness/embed";

    const handle = mount({
      target: "#agent-panel",
      apiOrigin: "https://api.example.test",
      oauth: {
        issuer: "https://auth.example.test",
        clientId: "<pre-registered-client-id>",
        redirectUri: "https://host.example.test/mtm/callback",
        resource: "https://dsh.example.test/api/dsh",
        scopes: ["openid", "dsh:connect"]
      },
      allowedParentOrigins: ["https://host.example.test"],
      mode: "floating"
    });

    handle.open();
    handle.openFullShell();
    handle.close();
    handle.unmount();

The CDN IIFE is `dist/embed/mtmharness.iife.js` and is also exposed through the package `unpkg` and `jsdelivr` fields. Declarative auto-mounting accepts only non-sensitive attributes such as `data-api-origin`, `data-mode`, and `data-target`; OAuth attributes must be provided together, with `data-oauth-scopes` as a space-separated list. It never reads a token from markup.

Embed uses memory history and never changes the host page URL. It mounts inside an open ShadowRoot, which is a DOM composition boundary rather than a security boundary, and removes its DOM, styles, observers, router, host bridge, and runtime on `unmount()`.

The minimal Shadow DOM check keeps the embed composition local: the official DSH `ui-layout` frame depends on the host slot renderer, while `ui-theme` presents through document-level `html`/`body` state and document styles. Those assumptions are not Shadow DOM-local, so the official layout/theme pair is not used as the embed shell. An official cloud shell remains the iframe boundary if the embed later needs the full DSH layout.

The package exposes the reusable browser OAuth client through `mtmharness/auth`; it is the same discovery-first implementation used by the independent client. The independent client performs discovery-first OAuth/OIDC Authorization Code + PKCE (S256). The full issuer, client ID, exact redirect URI, independent resource, caller-provided scopes, HTTPS endpoints, and provider capabilities are validated before authorization. `openid` is required for ID-token verification; API and refresh scopes come from the registered authority profile. Dynamic client registration is not implemented; production clients and redirect URIs must be registered by the provider.

Access and refresh tokens live only in the JavaScript memory of the auth client. A short-lived PKCE transaction containing state/verifier/nonce is the only auth state written to partitioned `sessionStorage`, and it is removed on every callback path. Callback URLs are sanitized after consumption. Tokens, tickets, roles, and capabilities are never put in markup, localStorage, iframe messages, logs, or WebSocket URLs.

HTTP resource calls, revocation, and `POST /api/dsh/ws-ticket` use an explicit `Authorization: Bearer` header with `credentials: "omit"`. Each socket requests a fresh v1 ticket and sends only `Sec-WebSocket-Protocol: dsh.v1, dsh-ticket.<opaque>`; the socket URL has no sandbox/session credential query. Refresh, logout, expiry, and account switching clear the runtime socket, selection, memory token, and account-partitioned session hint.

The official DSH plugin keeps the host FullShell and local session untouched.

## Development

    pnpm install
    pnpm --filter mtmharness run check
    pnpm --filter mtmharness run build

The standalone app keeps its static HTML and public assets under `standalone/`; its TypeScript, React, and CSS source is owned by `src/embed/`. The standalone app and `./embed` share the same feature composition while keeping separate host adapters.
