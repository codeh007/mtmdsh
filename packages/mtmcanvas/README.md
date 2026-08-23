# mtmcanvas

Installable Canvas view plugin for the DeepSeek Harness Web client.

The package has two DSH faces:

- Host half: `lib/index.js`, currently a lifecycle-only loader entry and profile bundle owner.
- Browser half: `lib/client.js`, a `window.__ModuleLoader__.load` plugin bundle that registers a session-scoped `conversation.view` entry.

The first release carries a fixture Canvas runtime so the plugin can be installed and exercised in an official DSH Web profile without claiming a production image provider. The Canvas document and generation types are JSON-safe and revisioned; a later Host provider can replace the fixture runtime without changing the view contract. Cancelled fixture generations retain their output node as a failed visual marker so the user can see the attempted flow.

## Install Into DSH Web

```bash
dsh plugin --profile web add mtmcanvas
# or: dsh plugin --profile web add /path/to/mtmcanvas-0.1.0.tgz
dsh --profile web --dump-config
```

The package patch inserts the `mtmcanvas` Loader row. The official Web client module table then discovers the `dsh.client` declaration and serves `exports["./client"]`.

## Development

```bash
pnpm install
pnpm --filter mtmcanvas run check
pnpm --filter mtmcanvas run pack:check
```

The browser artifact intentionally uses the Host React singleton and DSH module-table externals. It is not a standalone app and does not create its own router, React root, authentication flow, or Agent session.

## Deferred Provider Work

The fixture runtime is a client-side verification provider only. Production `CanvasService`, `canvas.describe` / `canvas.mutate` / `canvas.generate` tools, gomtmui Canvas DO integration, R2 assets, sandbox scope, and the future mtmagent adapter remain separate stages.
