import type { CanvasAssetReference } from "./canvas.ts";

export type GenerationTaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface GenerationTask {
  generationId: string;
  canvasId: string;
  sourceRevision: number;
  prompt: string;
  status: GenerationTaskStatus;
  createdAt: number;
  updatedAt: number;
  outputNodeId: string;
  outputAsset?: CanvasAssetReference;
  errorCode?: string;
  attempt: number;
  idempotencyKey: string;
}

export class GenerationStateError extends Error {
  readonly code = "generation_state_error";

  constructor(message: string) {
    super(message);
    this.name = "GenerationStateError";
  }
}

function id(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return prefix + "-" + crypto.randomUUID();
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createGenerationTask(input: {
  canvasId: string;
  sourceRevision: number;
  prompt: string;
  outputNodeId: string;
  now?: number;
  idempotencyKey?: string;
}): GenerationTask {
  const prompt = input.prompt.trim();
  if (!prompt) throw new GenerationStateError("generation prompt must not be empty");
  const now = input.now ?? Date.now();
  return {
    generationId: id("generation"),
    canvasId: input.canvasId,
    sourceRevision: input.sourceRevision,
    prompt,
    status: "queued",
    createdAt: now,
    updatedAt: now,
    outputNodeId: input.outputNodeId,
    attempt: 0,
    idempotencyKey: input.idempotencyKey ?? id("request"),
  };
}

const transitions: Record<GenerationTaskStatus, readonly GenerationTaskStatus[]> = {
  queued: ["running", "cancelled", "failed"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: ["queued"],
  cancelled: ["queued"],
};

export function transitionGenerationTask(
  task: GenerationTask,
  status: GenerationTaskStatus,
  patch: Partial<Pick<GenerationTask, "outputAsset" | "errorCode" | "attempt">> = {},
  now = Date.now(),
): GenerationTask {
  if (!transitions[task.status].includes(status)) {
    throw new GenerationStateError("invalid generation transition: " + task.status + " -> " + status);
  }
  return {
    ...task,
    ...patch,
    status,
    updatedAt: now,
    attempt: patch.attempt ?? (status === "running" ? task.attempt + 1 : task.attempt),
  };
}

export function createFixtureAsset(generationId: string): CanvasAssetReference {
  return {
    assetId: "fixture-asset-" + generationId,
    mediaType: "image",
    status: "ready",
    digest: "fixture:" + generationId,
    bytes: 1,
    width: 1024,
    height: 1024,
    previewLabel: "Fixture render",
  };
}
