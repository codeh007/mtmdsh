export type ConnectStatus = "online" | "offline";

export interface MockConnection {
  readonly id: string;
  readonly label: string;
  readonly target: string;
  readonly status: ConnectStatus;
  readonly generation: number;
  readonly latencyMs: number;
  readonly capabilities: readonly string[];
  readonly lastSeen: number;
}

export interface ConnectViewState {
  readonly connections: readonly MockConnection[];
  readonly selectedId: string;
  readonly loading: boolean;
  readonly notice?: string;
  readonly error?: string;
}

export interface ConnectActions {
  refresh(): void;
  select(id: string): void;
  toggle(id: string): void;
}

function initialConnections(now: number): MockConnection[] {
  return [
    {
      id: "mock-android",
      label: "Android device",
      target: "VMOS Cloud sandbox",
      status: "online",
      generation: 1,
      latencyMs: 82,
      capabilities: ["screen", "input", "files"],
      lastSeen: now,
    },
    {
      id: "mock-workstation",
      label: "Workstation",
      target: "Mock execution world",
      status: "offline",
      generation: 0,
      latencyMs: 0,
      capabilities: ["shell", "files"],
      lastSeen: now,
    },
  ];
}

/** In-memory device and execution-world state for the first mtm-connect release. */
export class ConnectRuntime implements ConnectActions {
  private view: ConnectViewState;
  private readonly listeners = new Set<() => void>();
  private disposed = false;

  constructor(private readonly now: () => number = Date.now) {
    const connections = initialConnections(now());
    this.view = {
      connections,
      selectedId: connections[0]!.id,
      loading: false,
      notice: "Mock backend",
    };
  }

  getSnapshot = (): ConnectViewState => this.view;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  refresh(): void {
    if (this.disposed) return;
    const lastSeen = this.now();
    this.set({
      connections: this.view.connections.map((connection) => ({ ...connection, lastSeen })),
      loading: false,
      notice: "Mock state refreshed",
      error: undefined,
    });
  }

  select(id: string): void {
    if (this.view.connections.every((connection) => connection.id !== id)) {
      this.set({ error: "Connection was not found" });
      return;
    }
    this.set({ selectedId: id, error: undefined });
  }

  toggle(id: string): void {
    const connection = this.view.connections.find((candidate) => candidate.id === id);
    if (connection === undefined) {
      this.set({ error: "Connection was not found" });
      return;
    }
    const online = connection.status !== "online";
    const nextStatus: ConnectStatus = online ? "online" : "offline";
    const nextGeneration = connection.generation + 1;
    this.set({
      connections: this.view.connections.map((candidate) => candidate.id === id
        ? { ...candidate, status: nextStatus, generation: nextGeneration, latencyMs: online ? 82 : 0, lastSeen: this.now() }
        : candidate),
      selectedId: id,
      notice: connection.label + (online ? " connected" : " disconnected"),
      error: undefined,
    });
  }

  private set(patch: Partial<ConnectViewState>): void {
    if (this.disposed) return;
    this.view = { ...this.view, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}
