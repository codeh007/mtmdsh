import { describe, expect, it } from "vitest";
import { projectExternalEvent, validateExternalEvent } from "./event.ts";
import type { ExternalConnectionEvent } from "./event.ts";

const fixture: ExternalConnectionEvent = {
  eventId: "event-1",
  connectionId: "connection-1",
  capabilityId: "device.control",
  generation: 1,
  occurredAt: 1_700_000_000_000,
  kind: "device.notification",
  payload: { title: "Build finished" },
  dedupeKey: "connection-1:1",
  source: "mock-device",
};

describe("external event contract", () => {
  it("projects each explicit policy without invoking an agent", () => {
    expect(projectExternalEvent(fixture, "observe", new Set()).disposition).toBe("observed");
    expect(projectExternalEvent(fixture, "inject-next", new Set()).disposition).toBe("queued");
    expect(projectExternalEvent(fixture, "wake-agent", new Set()).disposition).toBe("wake-agent");
    expect(projectExternalEvent(fixture, "require-approval", new Set()).disposition).toBe("approval-required");
    expect(projectExternalEvent(fixture, "disabled", new Set()).reason).toBe("policy-disabled");
  });

  it("enforces the bounded JSON event envelope", () => {
    expect(validateExternalEvent(fixture)).toEqual(fixture);
    expect(() => validateExternalEvent({ ...fixture, payload: { body: "x".repeat(9_000) } })).toThrow("8 KiB");
    expect(() => validateExternalEvent({ ...fixture, command: "rm -rf /" })).toThrow("unsupported field");
  });
});
