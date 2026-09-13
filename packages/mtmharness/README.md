# mtmharness

mtmharness is a browser-first React application for conversation, workspace, P2P, and settings surfaces. The browser app owns its mount root, presentation, and navigation; DSH integration is optional and must be supplied by an explicit host capability.

The package does not register an mtmharness card in the DSH Settings page and does not implement package updates. In particular, it never reads a DSH profile from the filesystem or runs pnpm to update itself. A future DSH host may expose a narrow update capability; mtmharness will consume it only after that public contract exists.

## Browser app

The package exposes browser bundles at dist/mtmharness.js (ESM) and dist/mtmharness.iife.js (IIFE). Configure the API origin and pre-registered public OAuth client before the bundle runs:

    window.__MTM_HARNESS_CONFIG__ = {
      apiOrigin: "https://gomtm-dev.yuepa8.com",
      oauth: {
        issuer: "https://gomtm-dev.yuepa8.com",
        clientId: "<pre-registered-client-id>",
        redirectUri: "https://host.example.test/mtm/callback",
        resource: "https://gomtm-dev.yuepa8.com/api/dsh",
        scopes: ["openid", "dsh:connect"]
      }
    };

Use the ESM mount API from an application build:

    import { mount } from "mtmharness/embed";

    const handle = mount({ target: "#agent-panel", apiOrigin: "https://api.example.test", mode: "floating" });
    handle.open();
    handle.openFullShell();
    handle.close();
    handle.unmount();

Widget mounts use memory history and do not change the host page URL. Independent applications can use hash or browser history. The settings view accepts explicit capability objects for authentication, the remote product API, P2P, DSH-local actions, and browser-owned coding settings. Missing capabilities render as unavailable; errors are shown as errors.

HTTP resource calls use an Authorization: Bearer header with credentials omitted. Tokens remain in JavaScript memory and are never read from markup or localStorage.

## DSH Web

Install mtmharness as a DSH host plugin when local coding capabilities are required:

    dsh plugin --profile web add mtmharness
    dsh --profile web --dump-config

The host plugin owns Codebase Memory, Modern Go, Ponytail, and RTK. These are DSH-local capabilities and are not automatically enabled by the browser app. Canvas is a separate mtmcanvas plugin.

## Development

    pnpm install
    pnpm --filter mtmharness typecheck
    pnpm --filter mtmharness test
