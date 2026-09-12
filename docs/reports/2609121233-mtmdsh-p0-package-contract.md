# mtmdsh P0 Package and Release Contract

Status: accepted decision record for issue #1017 P0.
Baseline: main at ab58dfc (2026-09-12).

This record freezes the current public package surface and the migration decisions that later P1-P4 work must preserve. The P1/P2 amendment below supersedes the original split declaration output for mtmharness after validation with one TypeScript configuration. It does not implement the Changesets migration or remove the existing release workflows.

## Scope

The workspace publishes two independent npm packages:

| Package | Current version | npm latest | Public role |
| --- | --- | --- | --- |
| mtmcanvas | 0.2.0 | 0.2.0 | Browser-only Cordis Canvas plugin |
| mtmharness | 0.9.26 | 0.9.26 | Unified DSH Host/client plugin plus browser embed APIs |

The package names and independent version lines are frozen. mtmcanvas is composed by mtmharness at runtime, but it is not a second DSH plugin and the packages are not a fixed or version-linked release group.

## Public Package Contract

### mtmcanvas

Manifest: packages/mtmcanvas/package.json

| Field | Frozen value |
| --- | --- |
| main | ./lib/client.js |
| types | ./lib/types/index.d.ts |
| files | lib/client.js, lib/types/**/*.d.ts, README.md, package.json, LICENSE |
| exports . | types ./lib/types/index.d.ts; import/default ./lib/client.js |
| exports ./client | types ./lib/types/client/index.d.ts; import/default ./lib/client.js |
| exports ./package.json | ./package.json |

The root source entry exports the Canvas apply plugin, MtmCanvasClient, and Canvas contract types. The published JavaScript is one browser ESM bundle; React and Cordis remain package development or peer integration concerns and are not bundled as a second runtime contract.

### mtmharness

Manifest: packages/mtmharness/package.json

| Field | Frozen value |
| --- | --- |
| main | ./lib/index.js |
| types | ./lib/types/index.d.ts |
| unpkg | ./dist/embed/mtmharness.iife.js |
| jsdelivr | ./dist/embed/mtmharness.iife.js |
| files | lib/index.js, lib/client.cjs, lib/p2p-worker.cjs, lib/types/**/*.d.ts, dist/embed, dist/auth.js, cordis.patch.yml, README.md, package.json, LICENSE |
| dependencies.npm | 11.7.0; runtime dependency used to resolve the package-owned npx CLI |

The explicit export map is intentionally heterogeneous:

| Subpath | JavaScript | Declaration | Consumer contract |
| --- | --- | --- | --- |
| . | lib/index.js | lib/types/index.d.ts | DSH Host plugin |
| ./client | lib/client.cjs | lib/types/client/index.d.ts | DSH Web client loader |
| ./embed | dist/embed/mtmharness.js | lib/types/embed/index.d.ts | Browser ESM mount API |
| ./auth | dist/auth.js | lib/types/embed/app/auth.d.ts | Standalone browser OAuth client |
| ./p2p-worker | lib/p2p-worker.cjs | lib/types/features/p2p/worker.d.ts | Worker entry |
| ./cordis.patch.yml | cordis.patch.yml | n/a | DSH bundle patch |
| ./package.json | package.json | n/a | Package metadata |

The ./embed and ./auth entries remain explicit. A wildcard export would erase the distinct runtime formats, declaration roots, or consumer roles. The package root remains the Host plugin; ./embed is mount-only and ./auth remains the standalone OAuth surface.

## Consumer Boundaries

- mtmcanvas remains a public direct Cordis package. It is not an internal implementation package, a DSH plugin, or a CDN-loaded secondary extension. mtmharness composes it through a workspace development dependency and bundles it into its client artifact; mtmharness does not publish mtmcanvas as a runtime dependency or pin a separate Canvas CDN resource.
- mtmharness/client is a DSH host-loader entry. Its generated file registers the mtmharness ModuleLoader envelope, so ordinary direct imports by application bundlers are not a supported runtime contract. The default-only export is intentional.
- mtmharness/p2p-worker is a supported SharedWorker module URL for consumers that provide it as workerUrl. The published .cjs filename is a stable browser resource path, not a promise of Node CommonJS import semantics; the current build output is loaded with SharedWorker type=module. Any filename or worker format change requires a separate compatibility decision.
- The retired mtm-connect, mtm-coding, and secondary-extension aliases must not be reintroduced.

## Verified Build Artifacts

The baseline passed pnpm exec turbo run build. The generated files are ignored build outputs, but their paths are part of the package contract:

- mtmcanvas: lib/client.js and declarations under lib/types/.
- mtmharness: lib/index.js, lib/client.cjs, lib/p2p-worker.cjs, dist/auth.js, dist/embed/mtmharness.js, dist/embed/mtmharness.iife.js, declarations under lib/types/.

## P1/P2 Contract Amendment

P1/P2 consolidated mtmharness declarations into the single `tsconfig.json` output at `lib/types/`. The previous `dist/types/embed/` entries above were a stale record of the removed embed-only TypeScript configuration, not a separately required runtime surface. The manifest, exports, build output checks, and packed tarball checks now use `lib/types/` for every mtmharness declaration.

This amendment was accepted after the rebased build and typecheck passed, the packed manifest resolved every declared export target, and the embed declaration remained mount-only while OAuth declarations stayed under `./auth`. No JavaScript entry, package name, version line, CDN field, or consumer role changed.

Baseline npm pack --dry-run --ignore-scripts produced 10 entries for mtmcanvas@0.2.0 and 54 entries for mtmharness@0.9.26 after the P1/P2 declaration consolidation. Package-local pack is a validation operation, not a supported publishing authority.

## Version and Release Decisions

1. Version authority: Changesets will be the only version authority after P3 migration. Each package remains independently versioned; changesets update only packages named by a changeset and required dependents.
2. Publish authority: one root Changesets workflow will run the workspace validation graph, package packing and metadata checks, and changeset publish. No new package-specific release workflow will be added.
3. Git tags: historical mtmcanvas-v* and mtmharness-v* tags remain immutable. After migration, Changesets-generated package@version tags are canonical; the old *-v<version> trigger convention is retired with the current workflows.
4. npm channel: published versions use the latest dist-tag unless a future release decision explicitly names another channel. Current registry state is mtmcanvas@0.2.0 and mtmharness@0.9.26 on latest.
5. CDN contract: retain both unpkg and jsdelivr, pointing to the mtmharness embed IIFE. Removing either field would change the bare CDN package URL contract and is therefore out of scope.
6. Package-local scripts: package-local npm pack remains useful for CI validation, but package-local publish is not a supported release path. Existing prepack scripts and the two release workflows are transitional until the root Changesets dry-run and migration gates pass.

## Migration Guardrails

P1 may simplify build configuration only when the frozen files, export targets, declaration paths, and runtime formats above remain unchanged. P2 may add root quality tasks without creating package-specific copies. P3 may remove the two existing release workflows and package prepack scripts only after a clean-checkout Changesets dry-run proves version commit, tag, pack, publish, provenance, registry read-back, and package entry verification in one workflow.

No code, package metadata, or workflow behavior is changed by this P0 record.
