export const CANVAS_SCHEMA_VERSION = 1 as const;

export type CanvasNodeKind = "prompt" | "image";
export type CanvasNodeStatus = "idle" | "queued" | "running" | "succeeded" | "failed";
export type CanvasAssetStatus = "pending" | "ready" | "failed";

export interface CanvasPosition {
  x: number;
  y: number;
}

export interface CanvasSize {
  width: number;
  height: number;
}

export interface CanvasViewport {
  x: number;
  y: number;
  k: number;
}

export interface CanvasAssetReference {
  assetId: string;
  mediaType: "image";
  status: CanvasAssetStatus;
  digest: string;
  bytes: number;
  width: number;
  height: number;
  previewLabel?: string;
  url?: string;
}

export interface CanvasNode {
  id: string;
  kind: CanvasNodeKind;
  title: string;
  position: CanvasPosition;
  size: CanvasSize;
  prompt: string;
  status: CanvasNodeStatus;
  asset?: CanvasAssetReference;
}

export interface CanvasConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
}

export interface CanvasDocument {
  schemaVersion: typeof CANVAS_SCHEMA_VERSION;
  canvasId: string;
  revision: number;
  nodes: CanvasNode[];
  connections: CanvasConnection[];
  viewport: CanvasViewport;
  updatedAt: number;
}

export type CanvasOperation =
  | { type: "node.add"; node: CanvasNode }
  | {
      type: "node.update";
      nodeId: string;
      patch: Partial<Pick<CanvasNode, "title" | "prompt" | "position" | "size" | "status" | "asset">>;
    }
  | { type: "node.remove"; nodeId: string }
  | { type: "connection.add"; connection: CanvasConnection }
  | { type: "connection.remove"; connectionId: string }
  | { type: "viewport.set"; viewport: CanvasViewport };

export interface CanvasMutation {
  expectedRevision: number;
  operations: CanvasOperation[];
}

export class CanvasValidationError extends Error {
  readonly code = "canvas_validation_error";

  constructor(message: string) {
    super(message);
    this.name = "CanvasValidationError";
  }
}

export class CanvasConflictError extends Error {
  readonly code = "canvas_revision_conflict";
  readonly expectedRevision: number;
  readonly actualRevision: number;

  constructor(expectedRevision: number, actualRevision: number) {
    super("canvas revision conflict: expected " + expectedRevision + ", actual " + actualRevision);
    this.name = "CanvasConflictError";
    this.expectedRevision = expectedRevision;
    this.actualRevision = actualRevision;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CanvasValidationError(label + " must be a non-empty string");
  }
}

function assertPosition(value: unknown, label: string): asserts value is CanvasPosition {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y)) {
    throw new CanvasValidationError(label + " must contain finite x and y values");
  }
}

function assertSize(value: unknown, label: string): asserts value is CanvasSize {
  if (!isRecord(value) || !finite(value.width) || !finite(value.height) || value.width <= 0 || value.height <= 0) {
    throw new CanvasValidationError(label + " must contain positive width and height values");
  }
}

function assertViewport(value: unknown): asserts value is CanvasViewport {
  if (!isRecord(value) || !finite(value.x) || !finite(value.y) || !finite(value.k) || value.k < 0.05 || value.k > 5) {
    throw new CanvasValidationError("viewport must contain finite x/y and a scale between 0.05 and 5");
  }
}

function assertAsset(value: unknown, label = "asset"): asserts value is CanvasAssetReference {
  if (!isRecord(value)) throw new CanvasValidationError(label + " must be an object");
  assertString(value.assetId, label + ".assetId");
  if (value.mediaType !== "image") throw new CanvasValidationError(label + ".mediaType must be image");
  if (value.status !== "pending" && value.status !== "ready" && value.status !== "failed") {
    throw new CanvasValidationError(label + ".status is invalid");
  }
  assertString(value.digest, label + ".digest");
  if (!finite(value.bytes) || value.bytes < 0 || !finite(value.width) || value.width <= 0 || !finite(value.height) || value.height <= 0) {
    throw new CanvasValidationError(label + " dimensions and bytes are invalid");
  }
}

function assertNode(value: unknown, label: string): asserts value is CanvasNode {
  if (!isRecord(value)) throw new CanvasValidationError(label + " must be an object");
  assertString(value.id, label + ".id");
  if (value.kind !== "prompt" && value.kind !== "image") throw new CanvasValidationError(label + ".kind is invalid");
  assertString(value.title, label + ".title");
  assertPosition(value.position, label + ".position");
  assertSize(value.size, label + ".size");
  if (typeof value.prompt !== "string") throw new CanvasValidationError(label + ".prompt must be a string");
  if (value.status !== "idle" && value.status !== "queued" && value.status !== "running" && value.status !== "succeeded" && value.status !== "failed") {
    throw new CanvasValidationError(label + ".status is invalid");
  }
  if (value.asset !== undefined) assertAsset(value.asset, label + ".asset");
}

function assertConnection(value: unknown, label: string): asserts value is CanvasConnection {
  if (!isRecord(value)) throw new CanvasValidationError(label + " must be an object");
  assertString(value.id, label + ".id");
  assertString(value.fromNodeId, label + ".fromNodeId");
  assertString(value.toNodeId, label + ".toNodeId");
  if (value.fromNodeId === value.toNodeId) throw new CanvasValidationError(label + " cannot connect a node to itself");
}

export function validateCanvasDocument(value: unknown): CanvasDocument {
  if (!isRecord(value)) throw new CanvasValidationError("canvas document must be an object");
  if (value.schemaVersion !== CANVAS_SCHEMA_VERSION) throw new CanvasValidationError("unsupported canvas schema version");
  assertString(value.canvasId, "canvasId");
  if (!Number.isInteger(value.revision) || (value.revision as number) < 0) throw new CanvasValidationError("revision must be a non-negative integer");
  if (!Array.isArray(value.nodes) || !Array.isArray(value.connections)) throw new CanvasValidationError("nodes and connections must be arrays");
  assertViewport(value.viewport);
  if (!finite(value.updatedAt)) throw new CanvasValidationError("updatedAt must be finite");

  const nodeIds = new Set<string>();
  value.nodes.forEach((node, index) => {
    assertNode(node, "nodes[" + index + "]");
    if (nodeIds.has(node.id)) throw new CanvasValidationError("duplicate node id: " + node.id);
    nodeIds.add(node.id);
  });

  const connectionIds = new Set<string>();
  value.connections.forEach((connection, index) => {
    assertConnection(connection, "connections[" + index + "]");
    if (connectionIds.has(connection.id)) throw new CanvasValidationError("duplicate connection id: " + connection.id);
    if (!nodeIds.has(connection.fromNodeId) || !nodeIds.has(connection.toNodeId)) {
      throw new CanvasValidationError("connection references an unknown node");
    }
    connectionIds.add(connection.id);
  });

  return value as unknown as CanvasDocument;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createCanvasId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "canvas-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createNodeId(prefix = "node"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return prefix + "-" + crypto.randomUUID();
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createCanvasDocument(canvasId = "demo-canvas", now = Date.now()): CanvasDocument {
  const promptNode: CanvasNode = {
    id: "prompt-direction",
    kind: "prompt",
    title: "Direction",
    position: { x: 140, y: 150 },
    size: { width: 290, height: 170 },
    prompt: "Editorial portrait, soft morning light, cobalt jacket, clean studio background",
    status: "idle",
  };
  const outputNode: CanvasNode = {
    id: "image-output",
    kind: "image",
    title: "Output",
    position: { x: 570, y: 125 },
    size: { width: 320, height: 250 },
    prompt: "",
    status: "idle",
  };
  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    canvasId,
    revision: 0,
    nodes: [promptNode, outputNode],
    connections: [{ id: "connection-direction-output", fromNodeId: promptNode.id, toNodeId: outputNode.id }],
    viewport: { x: 70, y: 40, k: 0.86 },
    updatedAt: now,
  };
}

function assertNodePatch(patch: Record<string, unknown>): void {
  if (patch.title !== undefined) assertString(patch.title, "node.patch.title");
  if (patch.prompt !== undefined && typeof patch.prompt !== "string") throw new CanvasValidationError("node.patch.prompt must be a string");
  if (patch.position !== undefined) assertPosition(patch.position, "node.patch.position");
  if (patch.size !== undefined) assertSize(patch.size, "node.patch.size");
  if (patch.status !== undefined && patch.status !== "idle" && patch.status !== "queued" && patch.status !== "running" && patch.status !== "succeeded" && patch.status !== "failed") {
    throw new CanvasValidationError("node.patch.status is invalid");
  }
  if (patch.asset !== undefined) assertAsset(patch.asset, "node.patch.asset");
}

export function applyCanvasMutation(document: CanvasDocument, mutation: CanvasMutation, now = Date.now()): CanvasDocument {
  validateCanvasDocument(document);
  if (!Number.isInteger(mutation.expectedRevision) || mutation.expectedRevision < 0) {
    throw new CanvasValidationError("expectedRevision must be a non-negative integer");
  }
  if (mutation.expectedRevision !== document.revision) {
    throw new CanvasConflictError(mutation.expectedRevision, document.revision);
  }
  if (!Array.isArray(mutation.operations) || mutation.operations.length === 0) {
    throw new CanvasValidationError("mutation must contain at least one operation");
  }

  const next = clone(document);
  const nodes = new Map(next.nodes.map((node) => [node.id, node]));
  const connections = new Map(next.connections.map((connection) => [connection.id, connection]));

  for (const operation of mutation.operations) {
    if (operation.type === "node.add") {
      assertNode(operation.node, "node.add.node");
      if (nodes.has(operation.node.id)) throw new CanvasValidationError("node already exists: " + operation.node.id);
      nodes.set(operation.node.id, clone(operation.node));
      continue;
    }
    if (operation.type === "node.update") {
      assertString(operation.nodeId, "node.update.nodeId");
      const node = nodes.get(operation.nodeId);
      if (!node) throw new CanvasValidationError("node not found: " + operation.nodeId);
      assertNodePatch(operation.patch as Record<string, unknown>);
      Object.assign(node, clone(operation.patch));
      continue;
    }
    if (operation.type === "node.remove") {
      assertString(operation.nodeId, "node.remove.nodeId");
      if (!nodes.delete(operation.nodeId)) throw new CanvasValidationError("node not found: " + operation.nodeId);
      for (const [connectionId, connection] of connections) {
        if (connection.fromNodeId === operation.nodeId || connection.toNodeId === operation.nodeId) connections.delete(connectionId);
      }
      continue;
    }
    if (operation.type === "connection.add") {
      assertConnection(operation.connection, "connection.add.connection");
      if (connections.has(operation.connection.id)) throw new CanvasValidationError("connection already exists: " + operation.connection.id);
      if (!nodes.has(operation.connection.fromNodeId) || !nodes.has(operation.connection.toNodeId)) {
        throw new CanvasValidationError("connection references an unknown node");
      }
      if ([...connections.values()].some((connection) => connection.fromNodeId === operation.connection.fromNodeId && connection.toNodeId === operation.connection.toNodeId)) {
        throw new CanvasValidationError("connection already exists between these nodes");
      }
      connections.set(operation.connection.id, clone(operation.connection));
      continue;
    }
    if (operation.type === "connection.remove") {
      assertString(operation.connectionId, "connection.remove.connectionId");
      if (!connections.delete(operation.connectionId)) throw new CanvasValidationError("connection not found: " + operation.connectionId);
      continue;
    }
    if (operation.type === "viewport.set") {
      assertViewport(operation.viewport);
      next.viewport = clone(operation.viewport);
      continue;
    }
    const exhaustive: never = operation;
    throw new CanvasValidationError("unsupported canvas operation: " + String(exhaustive));
  }

  next.nodes = [...nodes.values()];
  next.connections = [...connections.values()];
  next.revision += 1;
  next.updatedAt = now;
  validateCanvasDocument(next);
  return next;
}

export function parseCanvasDocument(value: unknown): CanvasDocument {
  return clone(validateCanvasDocument(value));
}
