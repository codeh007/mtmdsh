import {
  applyCanvasMutation,
  createCanvasDocument,
  createNodeId,
  type CanvasNode,
  type CanvasOperation,
  type CanvasPosition,
  type CanvasDocument,
} from "../contract/canvas.ts";
import {
  createFixtureAsset,
  createGenerationTask,
  transitionGenerationTask,
  type GenerationTask,
} from "../contract/generation.ts";
import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-runtime/client";

export interface CanvasViewState {
  readonly document: CanvasDocument;
  readonly task?: GenerationTask;
  readonly busy: boolean;
  readonly error?: string;
}

export type CanvasListener = () => void;

export interface CanvasViewActions {
  addPrompt(): void;
  moveNode(nodeId: string, position: CanvasPosition): void;
  generate(prompt: string, sourceNodeId?: string): Promise<void>;
  cancel(): void;
}

function outputNode(source: CanvasNode | undefined, id: string): CanvasNode {
  return {
    id,
    kind: "image",
    title: "Generated image",
    position: source === undefined
      ? { x: 560, y: 190 }
      : { x: source.position.x + source.size.width + 120, y: source.position.y - 20 },
    size: { width: 330, height: 250 },
    prompt: "",
    status: "queued",
  };
}

function promptNode(id: string, prompt: string): CanvasNode {
  return {
    id,
    kind: "prompt",
    title: "Prompt",
    position: { x: 150, y: 190 },
    size: { width: 300, height: 180 },
    prompt,
    status: "idle",
  };
}

export class CanvasFixtureRuntime implements ObservableSnapshot<CanvasViewState>, CanvasViewActions {
  private snapshot: CanvasViewState;
  private readonly listeners = new Set<CanvasListener>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private disposed = false;

  constructor(canvasId = "fixture-canvas") {
    this.snapshot = { document: createCanvasDocument(canvasId), busy: false };
  }

  getSnapshot(): CanvasViewState {
    return this.snapshot;
  }

  subscribe(listener: CanvasListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  addPrompt(): void {
    this.mutate([{
      type: "node.add",
      node: promptNode(
        createNodeId("prompt"),
        "",
      ),
    }]);
  }

  moveNode(nodeId: string, position: CanvasPosition): void {
    this.mutate([{ type: "node.update", nodeId, patch: { position } }]);
  }

  async generate(prompt: string, sourceNodeId?: string): Promise<void> {
    this.ensureActive();
    if (this.snapshot.busy) throw new Error("A generation task is already running.");
    const value = prompt.trim();
    if (!value) throw new Error("Add a prompt before generating.");

    const source = sourceNodeId === undefined
      ? undefined
      : this.snapshot.document.nodes.find((node) => node.id === sourceNodeId);
    if (sourceNodeId !== undefined && source === undefined) throw new Error("The selected prompt node no longer exists.");
    if (source !== undefined && source.kind !== "prompt") throw new Error("Select a prompt node before generating.");

    const promptId = source?.id ?? createNodeId("prompt");
    const outputId = createNodeId("image");
    const operations: CanvasOperation[] = [];
    if (source === undefined) operations.push({ type: "node.add", node: promptNode(promptId, value) });
    else if (source.prompt !== value) operations.push({ type: "node.update", nodeId: source.id, patch: { prompt: value } });
    operations.push({ type: "node.add", node: outputNode(source, outputId) });
    operations.push({
      type: "connection.add",
      connection: { id: "connection-" + outputId, fromNodeId: promptId, toNodeId: outputId },
    });
    this.mutate(operations);

    const task = createGenerationTask({
      canvasId: this.snapshot.document.canvasId,
      sourceRevision: this.snapshot.document.revision,
      prompt: value,
      outputNodeId: outputId,
    });
    this.update({ task, busy: true, error: undefined });

    this.schedule(() => {
      if (this.snapshot.task?.generationId !== task.generationId || this.snapshot.task.status !== "queued") return;
      this.update({ task: transitionGenerationTask(task, "running") });
    }, 140);
    this.schedule(() => {
      if (this.snapshot.task?.generationId !== task.generationId || this.snapshot.task.status !== "running") return;
      const asset = createFixtureAsset(task.generationId);
      const succeeded = transitionGenerationTask(this.snapshot.task, "succeeded", { outputAsset: asset });
      this.updateNode(outputId, { status: "succeeded", asset });
      this.update({ task: succeeded, busy: false, error: undefined });
    }, 900);
  }

  cancel(): void {
    this.ensureActive();
    const task = this.snapshot.task;
    if (task === undefined || !this.snapshot.busy) return;
    this.clearTimers();
    const cancelled = transitionGenerationTask(task, "cancelled", { errorCode: "cancelled" });
    this.updateNode(task.outputNodeId, { status: "failed" });
    this.update({ task: cancelled, busy: false, error: undefined });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    this.listeners.clear();
  }

  private mutate(operations: CanvasOperation[]): void {
    this.ensureActive();
    try {
      const document = applyCanvasMutation(this.snapshot.document, {
        expectedRevision: this.snapshot.document.revision,
        operations,
      });
      this.update({ document, error: undefined });
    } catch (error) {
      this.update({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private updateNode(nodeId: string, patch: Partial<Pick<CanvasNode, "status" | "asset">>): void {
    this.mutate([{ type: "node.update", nodeId, patch }]);
  }

  private update(patch: Partial<CanvasViewState>): void {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }

  private schedule(callback: () => void, delay: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.disposed) callback();
    }, delay);
    this.timers.add(timer);
  }

  private clearTimers(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.clear();
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("Canvas runtime has been disposed.");
  }
}
