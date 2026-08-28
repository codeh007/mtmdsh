import { createCanvasDocument, createNodeId, type CanvasDocument, type CanvasPosition } from "../contract/canvas.ts";

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

const CANVAS_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.canvas$/u;

/** In-memory Canvas state for the first browser-only extension experiment. */
export class CanvasRuntime implements CanvasActions {
  private view: CanvasViewState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor() {
    const name = "demo.canvas";
    this.view = {
      files: [{ name, version: "0" }],
      name,
      version: "0",
      document: createCanvasDocument("demo"),
      loading: false,
    };
  }

  getSnapshot = (): CanvasViewState => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  refresh(): void {
    if (!this.disposed) this.set({ loading: false, error: undefined });
  }

  open(name: string): void {
    const file = this.view.files.find((item) => item.name === name);
    if (file === undefined) {
      this.set({ error: "Canvas file was not found" });
      return;
    }
    this.set({ name, version: file.version, document: createCanvasDocument(name.slice(0, -".canvas".length)), error: undefined });
  }

  create(name: string): void {
    const fileName = name.endsWith(".canvas") ? name : name + ".canvas";
    if (!CANVAS_NAME.test(fileName)) {
      this.set({ error: "Canvas filename is invalid" });
      return;
    }
    const file = { name: fileName, version: "0" };
    const files = [...this.view.files.filter((item) => item.name !== fileName), file];
    this.set({ files, name: fileName, version: file.version, document: createCanvasDocument(fileName.slice(0, -".canvas".length)), error: undefined });
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
    if (this.view.name === undefined || this.view.document === undefined) return;
    const version = String(Number.parseInt(this.view.version ?? "0", 10) + 1);
    const files = this.view.files.map((file) => file.name === this.view.name ? { ...file, version } : file);
    this.set({ files, version, error: undefined });
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

  private set(patch: Partial<CanvasViewState>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
