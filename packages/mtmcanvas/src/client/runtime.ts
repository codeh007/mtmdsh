import type { ObservableSnapshot } from "@deepseek-ai/dsh-client-runtime/client";
import type { ClientConnectionRpc } from "@deepseek-ai/dsh-client-connection/client";
import { MTM_CANVAS_CHANNEL, type CanvasFileWire, type CanvasReadWire } from "../contract/rpc.ts";
import { createCanvasDocument, createNodeId, validateCanvasDocument, type CanvasDocument, type CanvasPosition } from "../contract/canvas.ts";

export interface CanvasFile {
  name: string;
  version: string;
}

export interface CanvasViewState {
  files: CanvasFile[];
  name?: string;
  version?: string;
  document?: CanvasDocument;
  loading: boolean;
  error?: string;
  conflict?: boolean;
}

export interface CanvasActions {
  refresh(): void;
  open(name: string): void;
  create(name: string): void;
  addPrompt(): void;
  updatePrompt(id: string, prompt: string): void;
  moveNode(id: string, position: CanvasPosition): void;
  setViewport(viewport: CanvasDocument["viewport"]): void;
  save(): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseFiles(value: unknown): CanvasFile[] {
  if (!Array.isArray(value)) throw new Error("Canvas file listing is invalid");
  return value.map((item) => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.version !== "string") throw new Error("Canvas file listing is invalid");
    return { name: item.name, version: item.version } satisfies CanvasFileWire;
  });
}

function parseRead(value: unknown): CanvasReadWire {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.version !== "string") throw new Error("Canvas read response is invalid");
  return { name: value.name, version: value.version, document: validateCanvasDocument(value.document) };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  const value = error as { code?: unknown };
  return typeof value.code === "string" ? value.code : undefined;
}

function isStaleError(error: unknown): boolean {
  return errorCode(error) === "FS_STALE_VERSION" || errorMessage(error).includes("FS_STALE_VERSION");
}

export class CanvasRuntime implements ObservableSnapshot<CanvasViewState>, CanvasActions {
  private view: CanvasViewState = { files: [], loading: true };
  private readonly listeners = new Set<() => void>();
  private readonly abortController = new AbortController();
  private disposed = false;
  private listSequence = 0;
  private selectionSequence = 0;
  private saveSequence = 0;

  constructor(private readonly rpc: ClientConnectionRpc) {
    this.refresh();
  }

  getSnapshot = (): CanvasViewState => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abortController.abort();
    this.listeners.clear();
  }

  refresh(): void {
    const sequence = ++this.listSequence;
    const selectionSequence = this.selectionSequence;
    this.set({ loading: true, error: undefined });
    void this.call({ kind: "list" })
      .then((value) => {
        if (sequence !== this.listSequence) return;
        const files = parseFiles(value);
        this.set({ files, loading: false });
        if (this.view.name === undefined && selectionSequence === this.selectionSequence && files[0] !== undefined) this.open(files[0].name);
      })
      .catch((error) => {
        if (sequence === this.listSequence) this.set({ loading: false, error: errorMessage(error) });
      });
  }

  open(name: string): void {
    const sequence = ++this.selectionSequence;
    this.set({ error: undefined, conflict: undefined });
    void this.call({ kind: "read", name })
      .then((value) => {
        if (sequence !== this.selectionSequence) return;
        const read = parseRead(value);
        this.set({ name: read.name, version: read.version, document: read.document, error: undefined, conflict: undefined });
      })
      .catch((error) => {
        if (sequence === this.selectionSequence) this.set({ error: errorMessage(error) });
      });
  }

  create(name: string): void {
    const sequence = ++this.selectionSequence;
    const document = createCanvasDocument(name.replace(/\.canvas$/u, ""));
    this.set({ error: undefined, conflict: undefined });
    void this.call({ kind: "create", name, document })
      .then((value) => {
        const read = parseRead(value);
        if (sequence === this.selectionSequence) this.set({ name: read.name, version: read.version, document: read.document, error: undefined, conflict: undefined });
        this.refresh();
      })
      .catch((error) => {
        if (sequence === this.selectionSequence) this.set({ error: errorMessage(error) });
      });
  }

  addPrompt(): void {
    if (this.view.document === undefined) return;
    const document = structuredClone(this.view.document);
    document.nodes.push({ id: createNodeId(), kind: "prompt", title: "Prompt", position: { x: 120, y: 360 }, size: { width: 300, height: 170 }, prompt: "" });
    document.revision += 1;
    document.updatedAt = Date.now();
    this.set({ document });
  }

  updatePrompt(id: string, prompt: string): void {
    this.patch(id, { prompt });
  }

  moveNode(id: string, position: CanvasPosition): void {
    this.patch(id, { position });
  }

  setViewport(viewport: CanvasDocument["viewport"]): void {
    if (this.view.document === undefined) return;
    const document = structuredClone(this.view.document);
    document.viewport = viewport;
    document.revision += 1;
    document.updatedAt = Date.now();
    this.set({ document });
  }

  save(): void {
    const { document, name, version } = this.view;
    if (document === undefined || name === undefined || version === undefined) return;
    const sequence = ++this.saveSequence;
    const selectionSequence = this.selectionSequence;
    const savedDocument = structuredClone(document);
    void this.call({ kind: "write", name, version, document: savedDocument })
      .then((value) => {
        if (sequence !== this.saveSequence || selectionSequence !== this.selectionSequence || this.view.name !== name) return;
        const read = parseRead(value);
        const localChanged = this.view.document?.revision !== savedDocument.revision;
        this.set({ version: read.version, ...(localChanged ? {} : { document: read.document }), error: undefined, conflict: undefined });
        this.refresh();
      })
      .catch((error) => {
        if (sequence !== this.saveSequence || selectionSequence !== this.selectionSequence || this.view.name !== name) return;
        this.set({ error: errorMessage(error), conflict: isStaleError(error) });
      });
  }

  private patch(id: string, patch: Partial<Pick<CanvasDocument["nodes"][number], "position" | "prompt">>): void {
    if (this.view.document === undefined) return;
    const document = structuredClone(this.view.document);
    const node = document.nodes.find((item) => item.id === id);
    if (node === undefined) return;
    Object.assign(node, patch);
    document.revision += 1;
    document.updatedAt = Date.now();
    this.set({ document });
  }

  private async call(args: unknown): Promise<unknown> {
    if (this.disposed) throw new Error("Canvas runtime is disposed");
    const result = await this.rpc.call(MTM_CANVAS_CHANNEL, "request", { args }, this.abortController.signal);
    if (!result.ok) {
      const error = new Error(result.error.message) as Error & { code?: string };
      if (typeof result.error.code === "string") error.code = result.error.code;
      throw error;
    }
    return result.value;
  }

  private set(patch: Partial<CanvasViewState>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of this.listeners) listener();
  }
}
