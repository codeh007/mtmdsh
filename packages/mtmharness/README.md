# mtmharness

`mtmharness` is one public npm package with two explicit client identities:

- **DSH Web plugin**: the package root and `./client` export use the official `dsh.client` lazy-CJS contract. The plugin adds an MTM Harness sidebar action to an existing DSH Web host.
- **Independent web client**: the package also publishes a BrowserHistory static app and a MemoryHistory script/embed entry. These artifacts own their React root, router, styles, and teardown.

The two identities have separate build entrypoints. The DSH plugin never imports the standalone app, router, runtime, or transport.

## DSH Web Plugin

Install the package into a web profile:

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Restart the DSH Web host after changing profile composition. The `MTM Harness` action appears in the sidebar footer and opens an in-page panel. The host owns the React root, session connection, and lifecycle.

## Static App

The package tarball contains `dist/standalone/index.html` and its hashed assets. Serve that directory as the static app root; the HTML uses relative asset URLs so it also works below a CDN or npm subpath. Configure the API origin, access token, and token-aware WebSocket factory before the app script runs:

    <script>
      window.__MTM_HARNESS_CONFIG__ = {
        apiOrigin: "https://api.example.test",
        accessToken: "<access-token>",
        webSocketFactory(url, token) {
          return createTokenAwareSocket(url, token);
        }
      };
    </script>
    <!-- Serve dist/standalone/index.html after this configuration. -->

The app uses browser history for direct navigation. A deployment must serve `index.html` for the app's routes.

## Script Embed

Use the ESM export from an application build:

    import { mount } from "mtmharness/embed";

    const handle = mount({
      target: "#agent-panel",
      apiOrigin: "https://api.example.test",
      accessToken,
      webSocketFactory,
      mode: "floating",
    });

    handle.unmount();

The CDN IIFE is `dist/embed/mtmharness.iife.js` and is also exposed through the package `unpkg` and `jsdelivr` fields. It supports declarative auto-mounting:

    <script
      src="https://cdn.example.test/mtmharness.iife.js"
      data-api-origin="https://api.example.test"
      data-access-token="<access-token>"
      data-mode="floating"
    ></script>

For a factory that is not serializable in markup, assign it through `window.__MTM_HARNESS_CONFIG__` before the script loads. Embed uses memory history and never changes the host page URL. It mounts inside a ShadowRoot and removes its own DOM, styles, observers, router, and runtime on `unmount()`.

## Authentication

The independent client does not read, send, or depend on browser cookies. HTTP requests use an explicit `Authorization: Bearer` header with `credentials: "omit"`. The package does not persist access or refresh tokens; the integrating application owns token acquisition, refresh, rotation, and revocation.

Browsers cannot attach arbitrary authorization headers to a native WebSocket constructor. `webSocketFactory` is therefore an explicit boundary for a token-aware ticket or handshake implementation. The client refuses to open an unauthenticated native socket instead of falling back to cookies.

The API origin must expose the corresponding bearer principal and WebSocket authentication contract. A cookie-only server is not a supported configuration.

## Development

    pnpm install
    pnpm --filter mtmharness run typecheck
    pnpm --filter mtmharness run test
    pnpm --filter mtmharness run build
    pnpm --filter mtmharness run verify:package
    pnpm --filter mtmharness run pack:check

The source under `standalone/` was copied from the former gomtm `mtmagent-client` as the migration baseline. It is now an active, token-only app surface; the DSH plugin remains a separate Host/Client implementation.
