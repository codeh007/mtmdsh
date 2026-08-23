# Releasing mtmdsh packages

## Current release unit

The first release unit is `mtm-codebase-memory`. The demo package
`mtmdsh-plugin-hello` is not part of the release workflow and must not be
published by a recursive workspace command.

The package version is the release identity. Tags use:

~~~text
mtm-codebase-memory-v<version>
~~~

For example: `mtm-codebase-memory-v0.2.0`.

## Publish

1. Confirm the npm publishing credential or trusted publisher is available.
2. Confirm the package version is not already present on npm.
3. Create and push the package tag from the merged main commit:

~~~sh
git tag -a mtm-codebase-memory-v0.2.0 -m 'release mtm-codebase-memory 0.2.0'
git push origin mtm-codebase-memory-v0.2.0
~~~

The workflow packs one tarball, verifies its exact files and metadata, runs
`publint`, publishes that exact tarball with provenance, and compares the
registry integrity with the local SHA-512 value.

## Local read-back

~~~sh
npm view mtm-codebase-memory@0.2.0 --json
~~~

## Update the DSH profile

Back up the profile before replacing a local tarball or package spec. Then:

~~~sh
dsh plugin --profile web remove mtm-codebase-memory
dsh plugin --profile web add mtm-codebase-memory@0.2.0
dsh --profile web --dump-config
~~~

Restart the DSH host after changing profile composition. Create a fresh
session, verify the `mcp__codebase_memory__*` tools, then explicitly index the
workspace before running graph queries.

## Authentication migration

The first publish uses `NPM_TOKEN` because the package must exist before its
npm Trusted Publisher configuration can be created. After the first successful
read-back, configure the package's GitHub Actions trusted publisher on npm and
remove the long-lived token path after an independent OIDC publish succeeds.
