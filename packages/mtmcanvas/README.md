# mtmcanvas

Experimental browser-only frontend extension for `mtmharness`.

The package is not a standard DSH plugin: it has no `dsh` manifest or profile patch. `mtmharness` owns its runtime loading, version pin, integrity check, and lifecycle.

## Extension contract

The package publishes one self-contained native ESM artifact at `lib/client.js`. It exports `mount(context)`, where `context` contains the extension id, version, an owned DOM root, the host `Document`, an `AbortSignal`, a cleanup-registration callback, and `apiVersion: 1`. The function returns an optional cleanup function. The extension does not receive DSH or Node.js internals.

The first experiment keeps Canvas data in browser memory. File persistence and host capabilities are intentionally deferred until the frontend ABI is proven. The artifact runs in the host page; SHA-256 integrity identifies the reviewed bytes but does not sandbox the code.

## Use Through mtmharness

Install only `mtmharness` into the DSH Web profile. The Dynamic Canvas setting loads the exact Canvas artifact at runtime; it does not modify the profile or create another DSH Loader entry.

The default experiment uses the published URL on unpkg, but the loader accepts any exact HTTPS static-host URL with CORS enabled. The artifact is fetched, checked against its SHA-256 integrity value, imported as native ESM, and mounted into an owned root.

## Development

    pnpm --filter mtmcanvas run check

The package metadata under `mtmharness.secondary` is consumed by the owning harness runtime. It is not a `dsh.bundle` or `dsh.client` declaration.
