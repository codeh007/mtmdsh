# mtm-codebase-memory

Optional [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) profile bundle for the local [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) server.

## What it provides

This package adds one profile patch row for DSH's official
@deepseek-ai/dsh-mcp-client bridge. The bridge starts the
codebase-memory-mcp executable over stdio and exposes its discovered tools
under the stable mcp__codebase_memory__* namespace.

The package does not include or install the native server. Indexes, cache files,
daemon processes, and project selection remain owned by codebase-memory-mcp.

## Prerequisites

- Node.js 22.19 or newer.
- An installed DSH web profile with the official MCP client available.
- The codebase-memory-mcp executable available on PATH.

The local integration was checked with codebase-memory-mcp 0.8.1 and the DSH
release line installed on the development host. Keep the DSH core packages on
one release line when publishing or deploying this bundle.

## Install

After publishing the package:

~~~sh
dsh plugin --profile web add mtm-codebase-memory
~~~

For a local checkout, install the package directory instead:

~~~sh
dsh plugin --profile web add /path/to/mtmdsh/packages/mtm-codebase-memory
~~~

The bundle is profile-wide by design. Once installed, every agent preset in the
profile can see the MCP tools. A new DSH host/session is required after changing
the profile composition; existing sessions keep their composition.

## First use

The server does not auto-index a workspace. In a new DSH session:

1. Call mcp__codebase_memory__list_projects or mcp__codebase_memory__index_status.
2. If the workspace is not indexed, call mcp__codebase_memory__index_repository with its absolute repo_path.
3. Use search_graph before trace_path when the exact symbol name is unknown.
4. Use get_code_snippet only after discovering the qualified symbol.

The model-facing names are generated from serverName: codebase_memory; do not
change that namespace casually because it changes the visible tool names.

## Configuration

The shipped row uses these defaults:

- transport: stdio
- command: codebase-memory-mcp
- working directory: DSH's process working directory
- extra environment: empty
- startup failure: the official client default

To constrain indexing, add a later row with the same id in the profile's
cordis.patch.yml and restate the complete MCP client configuration. Patch
layers replace a row's whole config rather than deep-merging it. For example,
set the server-owned CBM_ALLOWED_ROOT explicitly for a known workspace:

~~~yaml
- insert:
    - id: mtm-codebase-memory
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: codebase_memory
        transport: stdio
        command: codebase-memory-mcp
        args: []
        cwd: !!js process.cwd()
        env:
          CBM_ALLOWED_ROOT: !!js process.env.CBM_ALLOWED_ROOT ?? process.cwd()
~~~

Do not put credentials in this patch. DSH scrubs credential-shaped ambient
variables before spawning stdio MCP children and merges only the explicit
variables in config.env.

## Verify

Inspect the composed profile without booting it:

~~~sh
dsh --profile web --dump-config
~~~

Look for a layer named mtm-codebase-memory and the
@deepseek-ai/dsh-mcp-client row. Then verify indexing and a structural
query from two fresh sessions in the same profile.

## Scope

This bundle targets local DSH stdio use. A Cloudflare Worker deployment needs a
separate authenticated remote MCP service and tenant-aware repository/cache
isolation; the native executable is not bundled into a Worker.
