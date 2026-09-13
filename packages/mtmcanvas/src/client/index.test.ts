import { describe, expect, it } from "vitest";
import { MtmCanvasClient } from "./index.js";

describe("MtmCanvasClient", () => {
  it("is enabled by default and allows explicit disabling", async () => {
    const client = new MtmCanvasClient();
    expect(client.getSnapshot().desired).toBe(true);

    await client.setEnabled(false);
    expect(client.getSnapshot().status).toBe("disabled");

    client.dispose();
  });

  it("ignores state changes after disposal", async () => {
    const client = new MtmCanvasClient({ enabled: false });
    client.dispose();

    await client.setEnabled(true);
    expect(client.getSnapshot().desired).toBe(false);
  });
});
