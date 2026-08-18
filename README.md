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

## DSH bundle

Install `mtm-codebase-memory` into a DSH profile to expose the official MCP
bridge for a local `codebase-memory-mcp` executable. The package owns only the
profile patch; the MCP server remains an external prerequisite. See the package
README for installation, workspace indexing, and security configuration.

## License

MIT
