# mtm-codebase-memory

A source-loadable [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) integration for the local [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) runtime.

## What it provides

The package exports a named Cordis plugin and a DSH profile bundle. Both paths use the same runtime implementation:

- The plugin executes its package-owned npm CLI through the current Node binary, so neither npx nor CBM must be on PATH.
- The pinned npm CLI provisions codebase-memory-mcp@0.10.8 on first use; the upstream wrapper verifies and caches the native runtime, including when lifecycle scripts are skipped.
- The official @deepseek-ai/dsh-mcp-client remains responsible for MCP tool discovery, namespacing, reconnect, tool execution, and disposal.
- The plugin maps CBM's graph-first instructions and documented explore/review workflows into DSH system-prompt assembly because the official bridge exposes MCP tools, not MCP prompts.
- Session-start context and CBM hook-augment results are delivered through DSH's logged agent and tool-context paths. Hook failures are bounded and fail open.

The model-facing tool namespace defaults to mcp__codebase_memory__*.

## Install

Install the bundle into the official local DSH web profile:

~~~sh
dsh plugin --profile web add mtm-codebase-memory
~~~

The bundle itself is installed into that profile; the native runtime is provisioned lazily by the package-owned npm CLI, so no global npx or codebase-memory-mcp command is required. A fresh DSH host is required after changing profile composition:

~~~sh
dsh --profile web --dump-config
~~~

The dump should contain a row named mtm-codebase-memory whose plugin name is also mtm-codebase-memory, not the old direct MCP-client row.

For a local checkout:

~~~sh
dsh plugin --profile web add /path/to/mtmdsh/packages/mtm-codebase-memory
~~~

## Source composition

The package can be loaded without a profile patch when a custom local DSH composition owns its plugin list:

~~~ts
import * as CodebaseMemory from "mtm-codebase-memory";

await ctx.plugin(CodebaseMemory, {
  serverName: "codebase_memory",
});
~~~

The plugin requires the DSH systemPrompt and local subprocess services. Its nested official MCP client requires the normal DSH tools and model services.

## Configuration

All fields are optional:

| Field | Default | Purpose |
| --- | --- | --- |
| serverName | codebase_memory | Stable MCP tool namespace |
| command / args | package-owned npm exec | Override the local executable for a controlled test or installation |
| cwd | DSH process cwd | Working directory for CBM and hook payloads |
| env | empty | Explicit CBM environment entries |
| cacheDir | unset | Sets CBM_CACHE_DIR |
| allowedRoot | unset | Sets CBM_ALLOWED_ROOT |
| ensureRuntime | true | Run the wrapper version check before MCP activation |
| augmentHooks | true | Enable session and read/search context augmentation |
| failOnStartupError | false | Use the official MCP client's startup failure policy |
| toolCallTimeoutMs | 60000 | MCP tool-call timeout |
| hookTimeoutMs | 2000 | Bounded hook-augment timeout |
| runtimeCheckTimeoutMs | 120000 | Binary provisioning/version-check timeout |

The shipped cordis.patch.yml supplies only the stable namespace. To override a row in a profile patch, restate the complete plugin config because DSH patch layers replace, rather than deep-merge, a matched row.

Example:

~~~yaml
- id: mtm-codebase-memory
  name: mtm-codebase-memory
  config:
    serverName: codebase_memory
    allowedRoot: !!js process.cwd()
    env:
      CBM_LOG_LEVEL: warn
~~~

Do not put credentials in the patch. DSH's subprocess and MCP layers apply their normal environment scrubbing; explicit values in env are intentional opt-ins.

## Lifecycle behavior

The plugin owns the current DSH-side frontend connection through Cordis. The native CBM runtime continues to own its shared daemon, watcher, indexes, and cache lifecycle. The plugin registers graph-first instructions in DSH system-prompt assembly and may add bounded CBM lifecycle context on the first step. Search/read tool events are translated to CBM's documented hook payload and any returned context is attached through DSH's logged tools/post-execute additional-context contract.

The integration does not run CBM's global codebase-memory-mcp install command. That command edits other agent clients' configuration files; DSH profile composition is the authority for this integration. The package-owned npm CLI is invoked only for the pinned package and native runtime provisioning.

## First use

In a fresh session:

1. Call mcp__codebase_memory__list_projects or mcp__codebase_memory__index_status.
2. If the workspace is not indexed, call mcp__codebase_memory__index_repository with its absolute repo_path.
3. Discover exact symbols with search_graph before calling trace_path or get_code_snippet.
4. Check has_more and use check_index_coverage before relying on negative or exhaustive conclusions.

## Verify

From the repository root:

~~~sh
pnpm check:mtm-codebase-memory
pnpm --filter mtm-codebase-memory pack --pack-destination dist/npm
node scripts/verify-package.mjs packages/mtm-codebase-memory dist/npm/mtm-codebase-memory-0.2.0.tgz
pnpm smoke:mtm-codebase-memory -- dist/npm/mtm-codebase-memory-0.2.0.tgz
~~~

## Scope

This package targets the official local Node DSH Web Harness. It does not provide a Cloudflare Worker or remote multi-tenant execution plane. The native CBM runtime must remain on the local execution host.
