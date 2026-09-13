# mtmcanvas

Standalone browser-only Canvas client plugin for DSH Web.

## DSH Web

Install it into the target profile independently from mtmharness:

    dsh plugin --profile web add mtmcanvas

The package exposes a `dsh.client` manifest for the web scanner. Its client entry registers the Canvas view in `shell.overlay`, owns its styles and runtime, and removes all registrations when the plugin fiber unloads.

Canvas is enabled by default. Pass `{ enabled: false }` to `apply(ctx, config)` to keep the overlay hidden, then call the client configuration API or reload the profile to enable it again. Canvas data remains in browser memory and is not persisted or sent to a network API.

## Development

    pnpm exec turbo run typecheck test --filter=mtmcanvas
    pnpm --filter=mtmcanvas pack --pack-destination .tmp/mtmcanvas-pack
