import { describe, expect, it } from "vitest";
import { applyCanvasMutation, CanvasConflictError, CanvasValidationError, createCanvasDocument, parseCanvasDocument } from "./canvas.ts";

describe("canvas document contract", () => {
  it("applies a validated mutation and advances one revision", () => {
    const initial = createCanvasDocument("canvas-test", 10);
    const next = applyCanvasMutation(initial, {
      expectedRevision: 0,
      operations: [{ type: "node.update", nodeId: "prompt-direction", patch: { title: "Hero direction" } }],
    }, 20);
    expect(next.revision).toBe(1);
    expect(next.updatedAt).toBe(20);
    expect(next.nodes.find((node) => node.id === "prompt-direction")?.title).toBe("Hero direction");
    expect(initial.revision).toBe(0);
  });

  it("rejects stale writers with the current revision", () => {
    const initial = createCanvasDocument();
    const next = applyCanvasMutation(initial, { expectedRevision: 0, operations: [{ type: "viewport.set", viewport: { x: 10, y: 20, k: 1 } }] });
    expect(() => applyCanvasMutation(next, { expectedRevision: 0, operations: [{ type: "viewport.set", viewport: { x: 0, y: 0, k: 1 } }] })).toThrow(CanvasConflictError);
  });

  it("removes incident connections when deleting a node", () => {
    const next = applyCanvasMutation(createCanvasDocument(), { expectedRevision: 0, operations: [{ type: "node.remove", nodeId: "prompt-direction" }] });
    expect(next.nodes.some((node) => node.id === "prompt-direction")).toBe(false);
    expect(next.connections).toEqual([]);
  });

  it("rejects duplicate edges and invalid viewport values", () => {
    const initial = createCanvasDocument();
    expect(() => applyCanvasMutation(initial, { expectedRevision: 0, operations: [{ type: "connection.add", connection: { id: "duplicate", fromNodeId: "prompt-direction", toNodeId: "image-output" } }] })).toThrow(CanvasValidationError);
    expect(() => applyCanvasMutation(initial, { expectedRevision: 0, operations: [{ type: "viewport.set", viewport: { x: 0, y: 0, k: 9 } }] })).toThrow(CanvasValidationError);
  });

  it("parses a copy so callers cannot mutate the stored document", () => {
    const parsed = parseCanvasDocument(createCanvasDocument());
    parsed.nodes[0].title = "changed locally";
    expect(createCanvasDocument().nodes[0].title).toBe("Direction");
  });
});
