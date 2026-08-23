# mtmdsh

Portable plugins for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## Demo

The first package is a minimal Cordis plugin. It exports the standard `name` and `apply` members and can be mounted by a loader or directly with `Context.plugin()`.

```sh
pnpm install
pnpm check
```

Expected output:

```text
Hello from mtmdsh.
```

## Packages

- `mtmdsh-plugin-hello`: minimal plugin and static-mount demo.
- `mtm-codebase-memory`: source-loadable, opt-in DSH plugin and profile bundle for codebase-memory-mcp.
- `mtmcanvas`: installable DSH Web Host/Client Canvas view plugin with a fixture provider.

## DSH Web Canvas plugin

`mtmcanvas` is installed into an official DSH Web profile as a standard dual-face plugin. Its profile patch inserts the Host row, while its `dsh.client` declaration publishes the session-scoped `conversation.view` bundle. The first release is fixture-only and does not claim a production image provider.

```sh
pnpm --filter mtmcanvas run check
pnpm --filter mtmcanvas run pack:check
```

## DSH bundle

Install `mtm-codebase-memory` into the official local DSH Web profile. The
plugin uses the official MCP bridge, provisions a pinned CBM runtime through its
package-owned npm CLI on first use, and adds graph-first prompt and lifecycle
context. See the package README for installation, configuration, indexing, and
security boundaries.

## Release

The first release unit is `mtm-codebase-memory`; the hello package is a demo and
is not published by the release workflow. See [RELEASING.md](RELEASING.md) for
package-specific tags, npm integrity read-back, and local DSH updates.

## License

MIT
