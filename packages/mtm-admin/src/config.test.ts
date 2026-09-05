import { describe, expect, it } from "vitest";
import { validateAdminOAuthConfig, type AdminOAuthConfig } from "./config";

const valid: AdminOAuthConfig = {
  issuer: "https://auth.example.test",
  clientId: "mtm-admin-web-v1",
  redirectUri: "https://admin.example.test/",
  resource: "https://auth.example.test/api/system",
  scopes: ["openid", "gomtm:admin"],
};

describe("Admin OAuth config", () => {
  it("requires the dedicated control-plane resource and scope", () => {
    expect(() => validateAdminOAuthConfig(valid)).not.toThrow();
    expect(() => validateAdminOAuthConfig({ ...valid, resource: "https://auth.example.test/api/dsh" })).toThrow("control plane");
    expect(() => validateAdminOAuthConfig({ ...valid, scopes: ["openid"] })).toThrow("gomtm:admin");
  });

  it("requires a canonical HTTPS issuer", () => {
    expect(() => validateAdminOAuthConfig({ ...valid, issuer: "http://auth.example.test" })).toThrow("HTTPS origin");
    expect(() => validateAdminOAuthConfig({ ...valid, issuer: "https://auth.example.test/path", resource: "https://auth.example.test/path/api/system" })).toThrow("HTTPS origin");
  });
});
