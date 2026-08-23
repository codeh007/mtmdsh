import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasFixtureRuntime } from "./runtime.ts";

afterEach(() => { vi.useRealTimers(); });

describe("CanvasFixtureRuntime", () => {
  it("emits queued, running, and succeeded states", async () => {
    vi.useFakeTimers();
    const runtime = new CanvasFixtureRuntime();
    const notifications: number[] = [];
    runtime.subscribe(() => notifications.push(runtime.getSnapshot().document.revision));
    await runtime.generate("A quiet editorial portrait", "prompt-direction");
    expect(runtime.getSnapshot().task?.status).toBe("queued");
    vi.advanceTimersByTime(140);
    expect(runtime.getSnapshot().task?.status).toBe("running");
    vi.advanceTimersByTime(760);
    expect(runtime.getSnapshot().task?.status).toBe("succeeded");
    expect(runtime.getSnapshot().busy).toBe(false);
    expect(runtime.getSnapshot().document.nodes.some((node) => node.asset?.status === "ready")).toBe(true);
    expect(notifications.length).toBeGreaterThan(0);
    runtime.dispose();
  });

  it("cancels a queued task and rejects use after disposal", async () => {
    vi.useFakeTimers();
    const runtime = new CanvasFixtureRuntime();
    await runtime.generate("A paper texture", "prompt-direction");
    const outputNodeId = runtime.getSnapshot().task?.outputNodeId;
    runtime.cancel();
    vi.advanceTimersByTime(1000);
    expect(runtime.getSnapshot().task?.status).toBe("cancelled");
    expect(runtime.getSnapshot().busy).toBe(false);
    expect(runtime.getSnapshot().document.nodes.find((node) => node.id === outputNodeId)?.status).toBe("failed");
    runtime.dispose();
    expect(() => runtime.addPrompt()).toThrow("disposed");
  });
});
