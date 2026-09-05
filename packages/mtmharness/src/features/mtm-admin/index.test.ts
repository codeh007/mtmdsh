import { describe, expect, it } from "vitest";
import { apply, MtmAdminSettingsSchema, SETTINGS_NAMESPACE } from "./index.ts";

describe("mtm-admin Host settings", () => {
  it("registers a disabled-by-default namespace", () => {
    let registration: { namespace: unknown; schema: unknown; options: unknown } | undefined;
    apply({
      settings: {
        register(namespace: unknown, schema: unknown, options: unknown) {
          registration = { namespace, schema, options };
          return {};
        },
      },
    } as never);
    expect(registration).toMatchObject({ namespace: SETTINGS_NAMESPACE, schema: MtmAdminSettingsSchema, options: { base: { enabled: false } } });
    expect(MtmAdminSettingsSchema({})).toMatchObject({ enabled: false });
  });
});
