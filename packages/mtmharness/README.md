# mtmharness

mtmharness is one public npm package with one unified DSH plugin. The package root supplies the Host plugin, and ./client supplies the single DSH Web client entry.

The client entry composes mtm-connect, mtmcanvas, mtm-admin, and mtm-p2p inside the mtmharness fiber. Each package keeps its own source and capability boundary; none is declared as a second DSH plugin and none uses a secondary runtime protocol.

Coding features remain under the mtm-coding settings namespace. Dynamic Canvas controls the composed Canvas view, while Connect and Admin settings control their composed shell views. All registrations, styles, listeners, and clients are disposed with the owning Cordis fiber.

The Modern Go Guidelines wrapper uses the pinned upstream CLI with standard go install and user cache behavior. It never creates a project-local cache or overrides the active DSH file policy.

## DSH Web Plugin

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

Only mtmharness is installed as a DSH plugin. Restart the DSH Web host after changing profile composition.

## Static App and Embed

The package also publishes the independent static app and explicit embed/auth exports. Those surfaces own their React roots and OAuth lifecycle and are not part of the DSH client composition.

## Development

    pnpm install
    pnpm --filter mtmharness run check
    pnpm --filter mtmharness run build
