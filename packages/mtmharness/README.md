# mtmharness

`mtmharness` is one public npm package with one unified DSH plugin and two explicit client identities:

- **DSH Web plugin**: the package root and `./client` export use the official `dsh.client` lazy-CJS contract. One installation provides the MTM sidebar action, the Connect control panel, and the settings-controlled Codebase Memory/Ponytail coding features.
- **Independent web client**: the package also publishes a BrowserHistory static app and a MemoryHistory script/embed entry. These artifacts own their React root, router, styles, and teardown and never load the local coding runtime.

The DSH plugin is assembled from Connect and coding feature domains under one Host/Client lifecycle. Codebase Memory keeps its `codebase_memory` server namespace and `mcp__codebase_memory__*` tool names; Ponytail ships six skills inline, including `/ponytail` and its companion commands. The `mtm-coding` settings namespace remains the configuration contract inside the unified `mtmharness` package.

RTK is an optional coding feature in the same `mtm-coding` settings namespace. `rtkMode` defaults to `auto`: it transparently rewrites Bash calls when the DSH `tools/pre-record-input` capability is available and falls back to inline guidance when it is not. Explicit `rewrite` is strict and reports `unavailable` on older DSH runtimes instead of changing frozen tool inputs. The pinned RTK `v0.45.0` binary is resolved from an explicit `rtkCommand` or lazily installed under the DSH home with checksum verification; RTK telemetry, tracking, and tee output are disabled for plugin-managed runs.

## DSH Web Plugin

Install the package into a web profile:

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Restart the DSH Web host after changing profile composition. The `MTM` action appears in the sidebar footer. The host owns the React root, session connection, and lifecycle. Install the independent `mtmcanvas` package to add the Canvas action and its Host/Client entry.

The plugin enables the Connect control panel by default and keeps its registry and `/mtm-connect` RPC on the DSH Host loopback boundary. The independent static/embed client remains a separate application surface and is not part of the DSH plugin.

### Independent Canvas plugin

Canvas is maintained as the separate `mtmcanvas` DSH package. Add it after installing or upgrading `mtmharness`:

    dsh plugin --profile web add mtmharness
    dsh plugin --profile web add mtmcanvas

Profiles created from an older `mtmharness` release should remove retired `mtm-connect` and `mtm-coding` rows before adding the current packages. The committed profile smoke still covers the old-row cleanup and duplicate install path:

    pnpm --filter mtmharness run profile:check -- /path/to/mtmharness.tgz

`mtmcanvas` now owns the Canvas Host/Client implementation; `mtm-connect` and `mtm-coding` remain historical package names and are not compatibility aliases.

## Static App

The package tarball contains `dist/standalone/index.html` and its hashed assets. Serve that directory as the static app root; the HTML uses relative asset URLs so it also works below a CDN or npm subpath. Configure the API origin and the pre-registered public OAuth client before the app script runs:

    <script>
      window.__MTM_HARNESS_CONFIG__ = {
        apiOrigin: "https://gomtm-dev.yuepa8.com",
        oauth: {
          issuer: "https://gomtm-dev.yuepa8.com",
          clientId: "<pre-registered-client-id>",
          redirectUri: "https://host.example.test/mtm/callback",
          resource: "https://gomtm-dev.yuepa8.com/api/dsh"
        }
      };
    </script>
    <!-- Serve dist/standalone/index.html after this configuration. -->

The app uses browser history for direct navigation. The default CDN config derives the exact OAuth callback from the final origin and pathname, so unpkg's `@latest` redirect remains compatible with exact redirect registration. The deployment authority must register that resolved URI, not a wildcard. A deployment must serve `index.html` for the app's routes and provide the CSP/frame-ancestors HTTP headers described by the static HTML contract.

## Script Embed

Use the ESM export from an application build:

    import { mount } from "mtmharness/embed";

    const handle = mount({
      target: "#agent-panel",
      apiOrigin: "https://api.example.test",
      oauth: {
        issuer: "https://auth.example.test",
        clientId: "<pre-registered-client-id>",
        redirectUri: "https://host.example.test/mtm/callback",
        resource: "https://auth.example.test/api/dsh"
      },
      allowedParentOrigins: ["https://host.example.test"],
      mode: "floating"
    });

    handle.open();
    handle.openFullShell();
    handle.close();
    handle.unmount();

The CDN IIFE is `dist/embed/mtmharness.iife.js` and is also exposed through the package `unpkg` and `jsdelivr` fields. Declarative auto-mounting accepts only non-sensitive attributes such as `data-api-origin`, `data-mode`, and `data-target`; it never reads a token from markup.

Embed uses memory history and never changes the host page URL. It mounts inside an open ShadowRoot, which is a DOM composition boundary rather than a security boundary, and removes its DOM, styles, observers, router, host bridge, and runtime on `unmount()`.

## Authentication

The independent client performs discovery-first OAuth/OIDC Authorization Code + PKCE (S256). The issuer, client ID, exact redirect URI, resource, endpoint origins, required `openid`/`dsh:connect` scopes, and provider capabilities are validated before authorization. Dynamic client registration is not implemented; production clients and origin/redirect allowlists must be registered by the server.

Access and refresh tokens live only in the JavaScript memory of the auth client. A short-lived PKCE transaction containing state/verifier/nonce is the only auth state written to partitioned `sessionStorage`, and it is removed on every callback path. Callback URLs are sanitized after consumption. Tokens, tickets, roles, and capabilities are never put in markup, localStorage, iframe messages, logs, or WebSocket URLs.

HTTP resource calls, revocation, and `POST /api/dsh/ws-ticket` use an explicit `Authorization: Bearer` header with `credentials: "omit"`. Each socket requests a fresh v1 ticket and sends only `Sec-WebSocket-Protocol: dsh.v1, dsh-ticket.<opaque>`; the socket URL has no sandbox/session credential query. Refresh, logout, expiry, and account switching clear the runtime socket, selection, memory token, and account-partitioned session hint.

The official DSH plugin keeps the host FullShell and local session untouched. Its additive launcher uses the latest stable unpkg app URL, an iframe sandbox/allow policy, and a `ready/open/close/theme/locale/resize` handshake validated by source, origin, nonce, and contract version. The launcher keeps `allow-same-origin` because OAuth transaction storage and API requests require the fixed CDN app origin; do not reuse this policy for arbitrary untrusted frames. The package release and CDN URL must be read back before calling the launcher production-ready.

## Development

    pnpm install
    pnpm --filter mtmharness run typecheck
    pnpm --filter mtmharness run test
    pnpm --filter mtmharness run build
    pnpm --filter mtmharness run verify:package
    pnpm --filter mtmharness run pack:check

The source under `standalone/` was copied from the former gomtm `mtmagent-client` as the migration baseline. It is now an active, token-only app surface; the DSH plugin remains a separate Host/Client implementation.
