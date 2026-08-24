export const CANVAS_SCHEMA_VERSION = 1 as const;

export type CanvasNodeKind = "prompt" | "image";
export interface CanvasPosition { x: number; y: number }
export interface CanvasSize { width: number; height: number }
export interface CanvasViewport { x: number; y: number; k: number }
export interface CanvasNode { id: string; kind: CanvasNodeKind; title: string; position: CanvasPosition; size: CanvasSize; prompt: string }
export interface CanvasConnection { id: string; fromNodeId: string; toNodeId: string }
export interface CanvasDocument { schemaVersion: typeof CANVAS_SCHEMA_VERSION; canvasId: string; revision: number; nodes: CanvasNode[]; connections: CanvasConnection[]; viewport: CanvasViewport; updatedAt: number }

const MAX_COORDINATE = 1_000_000;
const MAX_NODE_SIZE = 10_000;
const MAX_NODES = 500;
const MAX_CONNECTIONS = 1_000;
const MAX_TEXT = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function boundedText(value: unknown, label: string, max = 256): string {
  if (typeof value !== "string") throw new Error(label + " must be a string");
  const text = value.trim();
  if (text.length === 0 || text.length > max) throw new Error(label + " is invalid");
  return text;
}
function coordinate(value: unknown, label: string): number {
  if (!isFiniteNumber(value) || Math.abs(value) > MAX_COORDINATE) throw new Error(label + " is invalid");
  return value;
}
function parsePosition(value: unknown, label: string): CanvasPosition {
  if (!isRecord(value)) throw new Error(label + " is invalid");
  return { x: coordinate(value.x, label + ".x"), y: coordinate(value.y, label + ".y") };
}
function parseSize(value: unknown, label: string): CanvasSize {
  if (!isRecord(value) || !isFiniteNumber(value.width) || !isFiniteNumber(value.height)) throw new Error(label + " is invalid");
  if (value.width <= 0 || value.height <= 0 || value.width > MAX_NODE_SIZE || value.height > MAX_NODE_SIZE) throw new Error(label + " is invalid");
  return { width: value.width, height: value.height };
}
function parseViewport(value: unknown): CanvasViewport {
  if (!isRecord(value) || !isFiniteNumber(value.k) || value.k < 0.05 || value.k > 5) throw new Error("canvas viewport is invalid");
  return { x: coordinate(value.x, "canvas viewport.x"), y: coordinate(value.y, "canvas viewport.y"), k: value.k };
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  if (!isRecord(value) || value.schemaVersion !== CANVAS_SCHEMA_VERSION) throw new Error("canvas document schema version is invalid");
  const revision = value.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 0) throw new Error("canvas revision is invalid");
  if (!Array.isArray(value.nodes) || value.nodes.length > MAX_NODES) throw new Error("canvas nodes are invalid");
  if (!Array.isArray(value.connections) || value.connections.length > MAX_CONNECTIONS) throw new Error("canvas connections are invalid");
  const updatedAt = value.updatedAt;
  if (!isFiniteNumber(updatedAt) || updatedAt < 0) throw new Error("canvas updatedAt is invalid");

  const nodeIds = new Set<string>();
  const nodes = value.nodes.map((raw, index): CanvasNode => {
    if (!isRecord(raw)) throw new Error("canvas node " + index + " is invalid");
    const id = boundedText(raw.id, "canvas node " + index + " id");
    if (nodeIds.has(id)) throw new Error("canvas node id is duplicated: " + id);
    nodeIds.add(id);
    if (raw.kind !== "prompt" && raw.kind !== "image") throw new Error("canvas node " + index + " kind is invalid");
    return {
      id,
      kind: raw.kind,
      title: boundedText(raw.title, "canvas node " + index + " title"),
      position: parsePosition(raw.position, "canvas node " + index + " position"),
      size: parseSize(raw.size, "canvas node " + index + " size"),
      prompt: typeof raw.prompt === "string" ? raw.prompt.slice(0, MAX_TEXT) : "",
    };
  });

  const connectionIds = new Set<string>();
  const connections = value.connections.map((raw, index): CanvasConnection => {
    if (!isRecord(raw)) throw new Error("canvas connection " + index + " is invalid");
    const id = boundedText(raw.id, "canvas connection " + index + " id");
    const fromNodeId = boundedText(raw.fromNodeId, "canvas connection " + index + " fromNodeId");
    const toNodeId = boundedText(raw.toNodeId, "canvas connection " + index + " toNodeId");
    if (connectionIds.has(id) || !nodeIds.has(fromNodeId) || !nodeIds.has(toNodeId) || fromNodeId === toNodeId) throw new Error("canvas connection " + index + " is invalid");
    connectionIds.add(id);
    return { id, fromNodeId, toNodeId };
  });

  return { schemaVersion: CANVAS_SCHEMA_VERSION, canvasId: boundedText(value.canvasId, "canvasId"), revision, nodes, connections, viewport: parseViewport(value.viewport), updatedAt };
}

export function createCanvasDocument(canvasId: string, now = Date.now()): CanvasDocument {
  const prompt: CanvasNode = { id: "prompt-1", kind: "prompt", title: "Prompt", position: { x: 120, y: 120 }, size: { width: 300, height: 170 }, prompt: "" };
  const image: CanvasNode = { id: "image-1", kind: "image", title: "Image", position: { x: 560, y: 120 }, size: { width: 300, height: 230 }, prompt: "" };
  return { schemaVersion: CANVAS_SCHEMA_VERSION, canvasId, revision: 0, nodes: [prompt, image], connections: [{ id: "connection-1", fromNodeId: prompt.id, toNodeId: image.id }], viewport: { x: 40, y: 30, k: 0.86 }, updatedAt: now };
}
export function createNodeId(): string {
  return "prompt-" + (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
}
