# mtmharness

Minimal MTM Harness panel plugin for the DeepSeek Harness Web client.

The first release is intentionally a small proof of the official plugin contract:

- the Host half contributes an installable Cordis loader row;
- the browser half is a dsh.client lazy-CJS bundle;
- the client registers one additive sidebar.footer.action entry;
- clicking the entry opens an in-page panel owned by the plugin fiber.

The package does not create a React root, router, ShadowRoot, WebSocket, API client, or cookie-auth session. DSH owns the host connection, session lifecycle, rendering root, and teardown.

## Install Into DSH Web

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Restart the DSH Web host after changing profile composition. The panel is visible from the sidebar footer after the client bundle loads.

## Development

    pnpm install
    pnpm --filter mtmharness run check
    pnpm --filter mtmharness run pack:check

The source was migrated from the former gomtm mtmagent client as a baseline. Only the official DSH plugin surface is active in this package; the former standalone application surface is not part of the release.

## Deferred Work

OAuth bearer transport, sandbox API adapters, the full conversation surface, standalone hosting, and third-party script mounting are later contracts. They are not silently implemented by this first panel release.
