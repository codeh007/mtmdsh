# mtm-admin

mtm-admin is the independent browser control-plane client for gomtm. It is public source and is not a standard DSH profile plugin. The package publishes a standalone static app, a programmatic embed, and a token-free mtmharness secondary launcher.

## Static app

Serve dist/standalone as the app root and provide a sibling config.js before the module script runs:

    window.__MTM_ADMIN_CONFIG__ = {
      apiOrigin: "https://gomtm.example.test",
      oauth: {
        issuer: "https://gomtm.example.test",
        clientId: "mtm-admin-web-v1",
        redirectUri: "https://admin.example.test/",
        resource: "https://gomtm.example.test/api/system",
        scopes: ["openid", "profile", "email", "offline_access", "gomtm:admin"]
      }
    };

The OAuth client uses Authorization Code with PKCE S256. The exact redirect URI must be registered at the authority. Tokens stay in JavaScript memory; only the short-lived PKCE transaction uses sessionStorage. API requests send Authorization Bearer and credentials omit. No cookie session is used.

## mtmharness launcher

mtmharness owns the trusted secondary manifest and loads mtm-admin's lib/client.js after the user enables the feature. The launcher only opens the configured standalone app URL and never receives a token. The host must point the manifest at a deployment of the static app that has its own public OAuth configuration.

The launcher uses the existing mount(context) -> cleanup contract. Its integrity pin identifies the reviewed artifact; it is not a JavaScript sandbox.

## Embed

The mtm-admin/embed export mounts the full React application into a caller-owned element:

    import { mount } from "mtm-admin/embed";
    const unmount = mount(document.querySelector("#admin"), {
      apiOrigin: "https://gomtm.example.test",
      oauth: {
        issuer: "https://gomtm.example.test",
        clientId: "mtm-admin-web-v1",
        redirectUri: "https://host.example.test/admin/callback",
        resource: "https://gomtm.example.test/api/system",
        scopes: ["openid", "gomtm:admin"]
      }
    });

Use the standalone app or launcher for the high-privilege default. Inline embed is an explicit opt-in because it executes in the caller page.

## Development

    pnpm --filter mtmharness run build
    pnpm --filter mtm-admin run check
