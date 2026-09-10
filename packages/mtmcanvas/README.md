# mtmcanvas

Experimental browser Canvas package composed by mtmharness.

The package exports a standard Cordis apply(ctx, config) entry. It owns the Canvas runtime, view, styles, and fiber cleanup. The enabled config controls whether the composed view is visible; no network loader, CDN URL, integrity manifest, or DSH plugin entry is involved.

Canvas data remains in browser memory.

## Development

    pnpm --filter mtmcanvas run check
