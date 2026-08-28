# mtmcanvas

Experimental independent DSH Web Canvas plugin extracted from the Canvas domain currently hosted by `mtmharness`.

The package publishes two DSH faces:

- Host half: `lib/index.js`, which mounts the existing file-backed Canvas RPC through DSH's abstract `ctx.fs` service.
- Browser half: `lib/client.cjs`, a `window.__ModuleLoader__.load` bundle that registers the Canvas sidebar action.

This package is the independent Canvas implementation for the dynamic-loading experiment. The published `mtmharness` package no longer statically mounts Canvas; install both packages when the Canvas surface is required.

## Install Into DSH Web

```bash
dsh plugin --profile web add mtmcanvas
dsh --profile web --dump-config

# Restart the Web profile after changing Bundle membership.
```

The package patch inserts the `mtmcanvas` Loader row. The official Web client module table discovers the `dsh.client` declaration and serves the exported `./client` bundle.

The separate `standalone/` client in `mtmharness` is not part of this plugin. It is the cloud multi-user client and does not receive the file-backed Host implementation.

## Development

```bash
pnpm --filter mtmcanvas run check
pnpm --filter mtmcanvas run pack:check
```

The browser artifact uses DSH's React singleton and dynamic module table. It does not create a React root, router, authentication flow, or local filesystem. `ctx.fs` is the Host capability boundary and can be backed by a remote implementation later.
