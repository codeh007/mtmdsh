import { describe, expect, it } from "vitest";
import { createCanvasDocument, validateCanvasDocument } from "./canvas.ts";

describe("Canvas document contract", () => {
  it("round-trips the file document shape", () => {
    const document = createCanvasDocument("demo", 10);
    expect(validateCanvasDocument(JSON.parse(JSON.stringify(document)))).toEqual(document);
  });

  it("rejects duplicate nodes and dangling connections", () => {
    const document = createCanvasDocument("demo");
    expect(() => validateCanvasDocument({ ...document, nodes: [...document.nodes, document.nodes[0]] })).toThrow("duplicated");
    expect(() => validateCanvasDocument({ ...document, connections: [{ id: "bad", fromNodeId: "missing", toNodeId: "image-1" }] })).toThrow("invalid");
  });

  it("rejects invalid node sizes", () => {
    const document = createCanvasDocument("demo");
    expect(() => validateCanvasDocument({ ...document, nodes: [{ ...document.nodes[0], size: { width: 0, height: 10 } }, document.nodes[1]] })).toThrow("size");
  });

  it("rejects non-string and oversized prompts", () => {
    const document = createCanvasDocument("demo");
    expect(() => validateCanvasDocument({ ...document, nodes: [{ ...document.nodes[0], prompt: 42 }, document.nodes[1]] })).toThrow("prompt");
    expect(() => validateCanvasDocument({ ...document, nodes: [{ ...document.nodes[0], prompt: "x".repeat(20_001) }, document.nodes[1]] })).toThrow("prompt");
  });
});
