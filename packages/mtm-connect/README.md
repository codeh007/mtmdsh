# mtm-connect

Browser client package composed by mtmharness.

The package exports a standard Cordis apply(ctx, config) entry from mtm-connect/client. It owns the in-memory device view, its styles, and cleanup. The package is intentionally not a standalone DSH plugin.

## Development

    pnpm --filter mtm-connect run check
