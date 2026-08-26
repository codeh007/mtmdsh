# mtm-coding

A unified DeepSeek Harness coding plugin containing Codebase Memory and Ponytail.

## What it provides

- A Host Cordis plugin that mounts the official DSH MCP client for the pinned codebase-memory-mcp@0.10.8 runtime.
- Graph-first Codebase Memory guidance under the stable mcp__codebase_memory__* namespace.
- Bounded session and read/search context augmentation with fail-open hook handling.
- Six Ponytail skills embedded in the Host bundle, so runtime loading does not depend on skills files or an external agent skills directory.
- Agent-scoped /ponytail mode switching and explicit Ponytail skill commands.
- A Web Client settings card under the DSH Plugins page.

The package uses DSH-native lifecycle, settings, skills, commands, system-prompt, and MCP services. It does not install or modify other agent clients' configuration files.

## Install

Published bundle:

~~~sh
dsh plugin --profile web add mtm-coding
dsh --profile web --dump-config
~~~

Local development:

~~~sh
dsh plugin --profile web add link:/workspace/mtmdsh/packages/mtm-coding
dsh --profile web --dump-config
~~~

Restart the DSH Web host after changing profile composition. The profile row is named mtm-coding.

## Configuration

The Plugins settings card stores one mtm-coding namespace. Defaults keep both domains enabled, use Ponytail full mode, and apply it to subagents. Settings changes are persisted through DSH and reconciled live; failed domain mounts are logged and retried on the next settings change.

The Codebase Memory server namespace remains codebase_memory for compatibility with existing tool names. Advanced runtime values can be supplied in a profile patch or Host composition:

~~~ts
import * as MtmCoding from "mtm-coding";

await ctx.plugin(MtmCoding, {
  serverName: "codebase_memory",
  allowedRoot: process.cwd(),
});
~~~

Do not put credentials in a profile patch.

## First use

1. Call mcp__codebase_memory__list_projects or mcp__codebase_memory__index_status.
2. If the workspace is not indexed, call mcp__codebase_memory__index_repository with an absolute repo_path.
3. Discover exact symbols with search_graph before tracing or reading definitions.
4. Check has_more and check_index_coverage before relying on exhaustive or negative conclusions.

## Verify

From the repository root:

~~~sh
pnpm check:mtm-coding
pnpm --filter mtm-coding pack --pack-destination dist/npm
node scripts/verify-package.mjs packages/mtm-coding dist/npm/mtm-coding-0.1.0.tgz
node scripts/verify-dsh-web.mjs dist/npm/mtm-coding-0.1.0.tgz
~~~

Set DSH_SMOKE_TOOL_CATALOG=1 for the optional live-session tool catalog assertion. It requires a working DSH model route.

## Scope

This package targets the official local Node DSH Web Harness. It does not provide a Cloudflare Worker or remote multi-tenant execution plane; the native Codebase Memory runtime remains on the local execution host.
