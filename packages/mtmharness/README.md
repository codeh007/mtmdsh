# mtmharness

`mtmharness` is one public npm package with one unified DSH plugin and two explicit client identities:

- **DSH Web plugin**: the package root and `./client` export use the official `dsh.client` lazy-CJS contract. One installation provides the settings-controlled MTM Connect secondary extension and the Codebase Memory/Modern Go/Ponytail coding features.
- **Independent web client**: the package also publishes a BrowserHistory static app and a MemoryHistory script/embed entry. These artifacts own their React root, router, styles, and teardown and never load the local coding runtime.

The DSH plugin is assembled from coding and secondary frontend domains under one Host/Client lifecycle. Codebase Memory keeps its `codebase_memory` server namespace and `mcp__codebase_memory__*` tool names; Ponytail ships six skills inline, including `/ponytail` and its companion commands. The `mtm-coding` settings namespace contains the runtime extension toggles.

Modern Go Guidelines is enabled by default as the inline `use-modern-go` skill. The skill uses the bundled JetBrains `v0.1.1` wrapper to resolve guidance for the target project version. The wrapper installs its CLI only when a Go task runs it, caches the binary outside the project, and reports a missing Go toolchain instead of assuming the host is prepared. `modernGoCommand` can replace the bundled wrapper command; `modernGoEnabled` removes the skill from the DSH catalog. The redistributed wrapper and license live under `resources/go-modern-guidelines/` and remain Apache-2.0.

RTK is an optional coding feature in the same `mtm-coding` settings namespace. `rtkMode` defaults to `auto`: it transparently rewrites Bash calls when the DSH `tools/pre-record-input` capability is available and falls back to inline guidance when it is not. Explicit `rewrite` is strict and reports `unavailable` on older DSH runtimes instead of changing frozen tool inputs. The pinned RTK `v0.45.0` binary is resolved from an explicit `rtkCommand` or lazily installed under the DSH home with checksum verification; RTK telemetry, tracking, and tee output are disabled for plugin-managed runs.

## DSH Web Plugin

Install the package into a web profile:

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Restart the DSH Web host after changing profile composition. Open Settings > Plugins > Plugin configuration to control MTM Connect. The host owns the React root, session connection, and lifecycle.

The plugin registers the `mtm-connect` settings namespace only. No local device backend, filesystem access, token, or loopback RPC is activated by this frontend experiment. The independent static/embed client remains a separate application surface and is not part of the DSH plugin.

## Secondary Extensions

`mtmharness` owns a runtime frontend-extension loader. The `MTM Connect` setting is enabled by default; disabling it fetches no artifact, and re-enabling it loads the exact pinned `mtm-connect` native ESM artifact, verifies its SHA-256 integrity, and mounts it through the `mount(context) -> cleanup` ABI. The settings card also provides an `Open Connect` action after the panel is hidden. The extension contract passes only an owned DOM root, document, version, abort signal, and cleanup-registration callback; it does not expose DSH or Node.js internals. The ESM still runs with normal page privileges, so integrity is an identity check, not a browser security boundary. Disabling the setting awaits cleanup and removes the owned root.

`mtm-connect` is an extension artifact, not a standard DSH plugin. Do not add it with `dsh plugin`; install only `mtmharness`. The artifact is currently a browser-only mock of device and execution-world connections. The default URL uses unpkg, but the manifest accepts any exact HTTPS static-host URL with CORS enabled. The host CSP must allow `connect-src` to the artifact origin and `script-src blob:` for the fetched ESM.

`mtmcanvas` remains a separate browser-only secondary artifact controlled by `Dynamic Canvas`, which stays off by default. Publish the pinned `mtm-connect` and `mtmcanvas` artifacts before `mtmharness`; the mtmharness release gate checks local, CDN, and manifest SHA-256 values.

Profiles created from an older `mtmharness` release should remove retired `mtmcanvas`, `mtm-connect`, and `mtm-coding` rows before adding the current package.

## Static App

The package tarball contains `dist/standalone/index.html` and its hashed assets. Serve that directory as the static app root; the HTML uses relative asset URLs so it also works below a CDN or npm subpath. Configure the API origin and the pre-registered public OAuth client before the app script runs:

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

## Authentication

The independent client performs discovery-first OAuth/OIDC Authorization Code + PKCE (S256). The full issuer, client ID, exact redirect URI, independent resource, caller-provided scopes, HTTPS endpoints, and provider capabilities are validated before authorization. `openid` is required for ID-token verification; API and refresh scopes come from the registered authority profile. Dynamic client registration is not implemented; production clients and redirect URIs must be registered by the provider.

Access and refresh tokens live only in the JavaScript memory of the auth client. A short-lived PKCE transaction containing state/verifier/nonce is the only auth state written to partitioned `sessionStorage`, and it is removed on every callback path. Callback URLs are sanitized after consumption. Tokens, tickets, roles, and capabilities are never put in markup, localStorage, iframe messages, logs, or WebSocket URLs.

HTTP resource calls, revocation, and `POST /api/dsh/ws-ticket` use an explicit `Authorization: Bearer` header with `credentials: "omit"`. Each socket requests a fresh v1 ticket and sends only `Sec-WebSocket-Protocol: dsh.v1, dsh-ticket.<opaque>`; the socket URL has no sandbox/session credential query. Refresh, logout, expiry, and account switching clear the runtime socket, selection, memory token, and account-partitioned session hint.

The official DSH plugin keeps the host FullShell and local session untouched. Its additive launcher uses the latest stable unpkg app URL, an iframe sandbox/allow policy, and a `ready/open/close/theme/locale/resize` handshake validated by source, origin, nonce, and contract version. The launcher keeps `allow-same-origin` because OAuth transaction storage and API requests require the fixed CDN app origin; do not reuse this policy for arbitrary untrusted frames. The package release and CDN URL must be read back before calling the launcher production-ready.

## Development

    pnpm install
    pnpm --filter mtmharness run typecheck
    pnpm --filter mtmharness run test
    pnpm --filter mtmharness run build

The source under `standalone/` was copied from the former gomtm `mtmagent-client` as the migration baseline. It is now an active, token-only app surface; the DSH plugin remains a separate Host/Client implementation.
