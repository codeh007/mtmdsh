import { describe, expect, it } from "vitest";
import { CanvasRuntime } from "./runtime.ts";

describe("CanvasRuntime", () => {
  it("starts with an in-memory demo canvas", () => {
    const runtime = new CanvasRuntime();
    expect(runtime.getSnapshot()).toMatchObject({ name: "demo.canvas", version: "0", loading: false });
    expect(runtime.getSnapshot().document?.canvasId).toBe("demo");
  });

  it("updates the selected document and advances its local version", () => {
    const runtime = new CanvasRuntime();
    runtime.updatePrompt("prompt-1", "local edit");
    expect(runtime.getSnapshot().document?.nodes[0]?.prompt).toBe("local edit");
    runtime.save();
    expect(runtime.getSnapshot().version).toBe("1");
    expect(runtime.getSnapshot().files[0]?.version).toBe("1");
  });

  it("rejects unsafe filenames without changing the selected canvas", () => {
    const runtime = new CanvasRuntime();
    runtime.create("../escape");
    expect(runtime.getSnapshot().error).toBe("Canvas filename is invalid");
    expect(runtime.getSnapshot().name).toBe("demo.canvas");
  });
});
