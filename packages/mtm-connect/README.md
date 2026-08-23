# mtm-connect

Experimental connection control-plane plugin for DeepSeek Harness Web.

The first release keeps the contract in one installable package and uses honest fixture data:

- Host side: owns a user-scoped registry and exposes it through DSH loopback Connection RPC.
- Client side: reads and mutates that Host snapshot through `ctx.connection`; it does not create a second registry in the installed plugin.
- UI: adds an MTM Connect sidebar action and a compact connection control panel.
- Core: models adapters, connection lifecycle, capability bindings, event policy, and channel generation fencing.
- Fixtures: mock-world and mock-device are executable only as deterministic in-memory simulations.
- Unavailable: SSH, Android, Chrome, and Cloudflare container entries are visible but cannot be enabled.

The package does not create a React root, router, ShadowRoot, WebSocket, or separate API transport. DSH owns the host connection, session lifecycle, rendering root, and teardown. Write-capable fixture operations fail closed until the user explicitly approves them; model requests cannot self-approve.

## Install Into DSH Web

    dsh plugin --profile web add mtm-connect
    dsh --profile web --dump-config

Restart the DSH Web host after changing profile composition. The MTM Connect action appears in the sidebar footer after the client bundle loads.

## Development

    pnpm install
    pnpm --filter mtm-connect run check
    pnpm --filter mtm-connect run pack:check

The Host registry is intentionally in-memory in this release. Its revisioned snapshot crosses the standard DSH Connection RPC and is fully validated on both sides, so reconnecting the Web client rehydrates the Host-owned state without changing the UI contract. The RPC is loopback-only until an authenticated remote transport contract exists.

## Deferred Work

Real SSH, Android APK, Chrome extension, social-account authorization, remote execution, persistent storage, agent-loop delivery, and separate adapter packages are later contracts. The unavailable catalog rows are not claims that those integrations already work.
