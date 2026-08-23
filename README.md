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
- `mtm-codebase-memory`: opt-in DSH bundle for the codebase-memory MCP server.
- `mtmcanvas`: installable DSH Web Host/Client Canvas view plugin with a fixture provider.

## DSH Web Canvas plugin

`mtmcanvas` is installed into an official DSH Web profile as a standard dual-face plugin. Its profile patch inserts the Host row, while its `dsh.client` declaration publishes the session-scoped `conversation.view` bundle. The first release is fixture-only and does not claim a production image provider.

```sh
pnpm --filter mtmcanvas run check
pnpm --filter mtmcanvas run pack:check
```

## DSH bundle

Install `mtm-codebase-memory` into a DSH profile to expose the official MCP
bridge for a local `codebase-memory-mcp` executable. The package owns only the
profile patch; the MCP server remains an external prerequisite. See the package
README for installation, workspace indexing, and security configuration.

## Release

The first release unit is `mtm-codebase-memory`; the hello package is a demo and
is not published by the release workflow. See [RELEASING.md](RELEASING.md) for
package-specific tags, npm integrity read-back, and local DSH updates.

## License

MIT
