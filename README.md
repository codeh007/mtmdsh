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
- `mtmharness`: minimal installable DSH Web panel plugin proving the additive sidebar contract.
- `mtm-connect`: experimental DSH Web connection control plane with fixture adapters and explicit unavailable boundaries.

## DSH Web Canvas plugin

`mtmcanvas` is installed into an official DSH Web profile as a standard dual-face plugin. Its profile patch inserts the Host row, while its `dsh.client` declaration publishes the session-scoped `conversation.view` bundle. The first release is fixture-only and does not claim a production image provider.

```sh
pnpm --filter mtmcanvas run check
pnpm --filter mtmcanvas run pack:check
```

## DSH Web MTM Harness plugin

`mtmharness` is the minimal first-stage MTM Harness plugin. It registers one sidebar footer action and an in-page panel without creating a second application root or transport.

```sh
pnpm --filter mtmharness run check
pnpm --filter mtmharness run pack:check
```

## DSH Web MTM Connect plugin

`mtm-connect` is the first experimental control-plane package for user-owned connections. It shows mock workstation and device adapters, lifecycle state, capability policy, event projection, and unavailable SSH/Android/Chrome/container entries without claiming those integrations are implemented.

```sh
pnpm --filter mtm-connect run check
pnpm --filter mtm-connect run pack:check
```

## DSH bundle

Install `mtm-codebase-memory` into the official local DSH Web profile. The
plugin uses the official MCP bridge, provisions a pinned CBM runtime through its
package-owned npm CLI on first use, and adds graph-first prompt and lifecycle
context. See the package README for installation, configuration, indexing, and
security boundaries.

## Release

The first release unit is `mtm-codebase-memory`; the hello package is a demo and
is not published by the release workflow. `mtm-connect` is checked and packable in CI,
but has no release workflow while its experimental contract is being validated. See
[RELEASING.md](RELEASING.md) for package-specific tags, npm integrity read-back, and local DSH updates.

## License

MIT
