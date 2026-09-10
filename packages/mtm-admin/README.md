# mtm-admin

Independent browser control-plane client for gomtm.

The package publishes a standalone static app, a programmatic embed, and a Cordis apply(ctx, config) launcher entry. The launcher contributes a token-free link to the DSH shell; the standalone app owns OAuth, API requests, and bearer tokens. No auth state crosses the mtmharness composition boundary.

The launcher accepts an optional validated appUrl and is not a separate DSH plugin.

## Development

    pnpm --filter mtm-admin run check
