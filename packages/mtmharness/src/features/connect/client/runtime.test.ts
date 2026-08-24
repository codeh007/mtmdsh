import { describe, expect, it, vi } from "vitest";
import { createMtmConnectRpcHandler } from "../index.ts";
import { createDemoRegistry } from "../core/registry.ts";
import { createMtmConnectTransport, MtmConnectClientRuntime } from "./runtime.ts";

describe("mtm-connect Host/Client transport", () => {
  it("requires an explicit fixture mode when no Host transport is supplied", () => {
    expect(() => new MtmConnectClientRuntime()).toThrow("mtm-connect: Host transport is required");
  });

  it("rejects an invalid initial remote snapshot before exposing it", () => {
    expect(() => new MtmConnectClientRuntime({ transport: {} as never, snapshot: { schemaVersion: 1 } as never })).toThrow("snapshot");
  });

  it("routes a sandbox control snapshot through the Host transport", async () => {
    const host = createDemoRegistry(() => Date.now(), {
      sandboxId: "sbx_00000000-0000-4000-8000-000000000607",
      workspaceId: "ws_00000000-0000-4000-8000-000000000607",
      owner: { issuer: "https://auth.example.test", subject: "demo-user" },
    });
    const handler = createMtmConnectRpcHandler(host, { allowControlReconcile: true });
    const rpc = { call: (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => handler(endpoint, payload, signal ?? new AbortController().signal) };
    const transport = createMtmConnectTransport(rpc);
    const response = await transport.reconcile({
      contractVersion: 1,
      scope: {
        sandboxId: "sbx_00000000-0000-4000-8000-000000000607",
        workspaceId: "ws_00000000-0000-4000-8000-000000000607",
        owner: { issuer: "https://auth.example.test", subject: "demo-user" },
      },
      revision: 1,
      adapters: [],
      desiredWorlds: [],
      observedWorlds: [],
      installation: null,
    });
    expect(response.snapshot.ownerId).toBe("demo-user");
    expect(host.getControlRevision()).toBe(1);
    host.dispose();
  });

  it("hydrates the Client from Host state and sends mutations back to the same registry", async () => {
    const host = createDemoRegistry();
    const handler = createMtmConnectRpcHandler(host);
    const rpc = {
      call: (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => {
        expect(channel).toBe("/mtm-connect");
        expect(endpoint).toBe("request");
        return handler(endpoint, payload, signal ?? new AbortController().signal);
      },
    };
    const client = new MtmConnectClientRuntime({ transport: createMtmConnectTransport(rpc) });
    try {
      await vi.waitFor(() => { expect(client.getSnapshot().snapshot.ownerId).toBe("demo-user"); });
      expect(client.getSnapshot().snapshot.revision).toBe(host.getSnapshot().revision);
      client.enableSelected();
      await vi.waitFor(() => { expect(host.getConnection("mock-workstation")?.observation.status).toBe("online"); });
      await vi.waitFor(() => { expect(client.getSnapshot().snapshot.revision).toBe(host.getSnapshot().revision); });
      expect(client.getSnapshot().snapshot.connections[0]?.observation.status).toBe("online");
    } finally {
      client.dispose();
      host.dispose();
    }
  });
});
