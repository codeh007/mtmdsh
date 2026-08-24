import { describe, expect, it } from "vitest";
import { createFixtureAsset, createGenerationTask, GenerationStateError, transitionGenerationTask } from "./generation.ts";

describe("generation contract", () => {
  it("creates a queued task and advances attempts when running", () => {
    const task = createGenerationTask({ canvasId: "canvas-test", sourceRevision: 2, prompt: " portrait ", outputNodeId: "image-1", now: 10, idempotencyKey: "request-1" });
    expect(task.prompt).toBe("portrait");
    expect(task.status).toBe("queued");
    const running = transitionGenerationTask(task, "running", {}, 20);
    expect(running.attempt).toBe(1);
    expect(running.updatedAt).toBe(20);
  });

  it("rejects invalid transitions and creates deterministic fixture metadata", () => {
    const task = createGenerationTask({ canvasId: "canvas-test", sourceRevision: 0, prompt: "portrait", outputNodeId: "image-1" });
    expect(() => transitionGenerationTask(task, "succeeded")).toThrow(GenerationStateError);
    expect(createFixtureAsset("generation-1")).toMatchObject({ assetId: "fixture-asset-generation-1", digest: "fixture:generation-1", status: "ready" });
  });
});
