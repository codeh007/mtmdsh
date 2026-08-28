import { describe, expect, it } from "vitest";
import { apply, MtmConnectSettingsSchema, SETTINGS_NAMESPACE } from "./index.ts";

describe("mtm-connect Host settings", () => {
  it("registers an enabled-by-default namespace", () => {
    let registration: { namespace: unknown; schema: unknown; options: unknown } | undefined;
    apply({
      settings: {
        register(namespace: unknown, schema: unknown, options: unknown) {
          registration = { namespace, schema, options };
          return {};
        },
      },
    } as never);
    expect(registration).toMatchObject({ namespace: SETTINGS_NAMESPACE, schema: MtmConnectSettingsSchema, options: { base: { enabled: true } } });
    expect(MtmConnectSettingsSchema({})).toMatchObject({ enabled: true });
  });
});
