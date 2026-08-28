# mtm-connect

Browser-only mock frontend extension for mtmharness.

The package is not a standard DSH plugin. It publishes one self-contained native ESM artifact at lib/client.js, exporting mount(context). mtmharness owns runtime loading, exact version, SHA-256 integrity, enable/disable setting, and cleanup.

The current UI models device and execution-world connections in memory. It supports selecting a connection, refreshing mock state, and toggling a connection online or offline. No backend, filesystem, token, or DSH service is required by the artifact.

## Development

    pnpm --filter mtm-connect run check

Install mtmharness into the DSH Web profile. The MTM Connect setting loads this artifact at runtime; do not install mtm-connect with dsh plugin.
