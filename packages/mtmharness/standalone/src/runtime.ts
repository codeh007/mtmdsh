import type { MtmHarnessWebSocketFactory } from "@/app/config";
import {
  DshApiClient,
  DshApiError,
  type DshClient,
  type DshHistoryEntry,
  type DshSessionEvent,
  type DshWorkspaceView,
  type MtmSessionSummary,
} from "@/dsh/adapter";
import { SandboxApiClient, type SandboxClient, type SandboxRecord, type SandboxStatus } from "@/sandbox/adapter";

export type RuntimeStatus = "idle" | "loading" | "streaming" | "auth-required" | "error";
export type RegistryStatus = "idle" | "loading" | "error";
export type SandboxCatalogStatus = "idle" | "loading" | "error";
export type RuntimeOperation = "refreshing" | "creating" | "selecting" | "renaming" | "forking" | "switching-sandbox" | "creating-sandbox";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}

export interface RuntimeSnapshot {
  status: RuntimeStatus;
  messages: ChatMessage[];
  error?: string;
  registryStatus: RegistryStatus;
  registryError?: string;
  sandboxCatalogStatus: SandboxCatalogStatus;
  sandboxError?: string;
  sandboxes: SandboxRecord[];
  selectedSandboxId?: string;
  defaultSandboxId?: string;
  workspaceId?: string;
  sandboxLifecycleStatus?: SandboxStatus;
  operation?: RuntimeOperation;
  workspaces: DshWorkspaceView[];
  archivedSessionIds: string[];
  sessions: MtmSessionSummary[];
  selectedSessionId?: string;
}

type JsonRecord = Record<string, unknown>;
type SessionEvent = DshSessionEvent;
type HistoryEntry = DshHistoryEntry;
type Listener = (snapshot: RuntimeSnapshot) => void;

export interface MtmHarnessRuntimeOptions {
  accessToken?: string;
  webSocketFactory?: MtmHarnessWebSocketFactory;
  client?: DshClient;
  sandboxClient?: SandboxClient;
}

export class MtmHarnessError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "MtmHarnessError";
  }
}

function createRpcId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function readTextContent(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((block) => {
    if (!block || typeof block !== "object") return "";
    const item = block as JsonRecord;
    return item.type === "text" && typeof item.text === "string" ? item.text : "";
  }).join("");
}

function messageText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return readTextContent((value as JsonRecord).content);
}

export function applySessionEvent(messages: ChatMessage[], event: SessionEvent): ChatMessage[] {
  const data = event.data && typeof event.data === "object" ? event.data as JsonRecord : {};
  if (event.type === "user/message") {
    const id = typeof data.id === "string" ? data.id : "user-" + (event.seq ?? createRpcId());
    const text = messageText(data);
    return [...messages.filter((item) => !(item.id.startsWith("local-") && item.text === text)), { id, role: "user", text }];
  }
  if (event.type === "assistant/chunk") {
    const chunk = data.chunk;
    const text = chunk && typeof chunk === "object" && (chunk as JsonRecord).type === "text-delta" && typeof (chunk as JsonRecord).text === "string" ? (chunk as JsonRecord).text as string : "";
    if (!text) return messages;
    const id = "stream-" + (data.turn ?? 0) + "-" + (data.step ?? 0);
    const existing = messages.find((item) => item.id === id);
    if (existing) return messages.map((item) => item.id === id ? { ...item, text: item.text + text, streaming: true } : item);
    return [...messages, { id, role: "assistant", text, streaming: true }];
  }
  if (event.type === "assistant/message") {
    const message = data.message;
    const id = message && typeof message === "object" && typeof (message as JsonRecord).id === "string" ? (message as JsonRecord).id as string : "assistant-" + (event.seq ?? createRpcId());
    const liveId = "stream-" + (data.turn ?? 0) + "-" + (data.step ?? 0);
    return [...messages.filter((item) => item.id !== liveId && item.id !== id), { id, role: "assistant", text: messageText(message) }];
  }
  return messages;
}

export function foldHistory(entries: HistoryEntry[]): ChatMessage[] {
  return entries.reduce((messages, entry) => applySessionEvent(messages, entry.event), [] as ChatMessage[]);
}

function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

function normalizeError(error: unknown): MtmHarnessError {
  if (error instanceof MtmHarnessError) return error;
  if (error instanceof DshApiError) return new MtmHarnessError(error.message, error.code);
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
    return new MtmHarnessError(error.message, code);
  }
  return new MtmHarnessError(String(error));
}

function isAuthError(error: MtmHarnessError): boolean {
  return error.code === "auth_required" || error.code === "auth_unavailable";
}

type ParsedSocketFrame =
  | { kind: "event"; event: SessionEvent }
  | { kind: "agent-error"; message: string };

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseSocketFrame(raw: unknown, sessionId: string): ParsedSocketFrame | undefined {
  if (typeof raw !== "string") return undefined;
  let message: unknown;
  try { message = JSON.parse(raw); } catch { return undefined; }
  if (!isRecord(message) || message.type !== "server-request" || !isRecord(message.payload)) return undefined;
  const payload = message.payload;
  if (payload.type === "host/agent-error" && payload.sessionId === sessionId) {
    return { kind: "agent-error", message: typeof payload.message === "string" ? payload.message : "The agent failed" };
  }
  if (payload.type !== "session/event" || payload.sessionId !== sessionId || !isRecord(payload.event)) return undefined;
  const event = payload.event;
  if (typeof event.type !== "string" || event.type.length === 0) return undefined;
  if (event.seq !== undefined && (typeof event.seq !== "number" || !Number.isInteger(event.seq) || event.seq < 0)) return undefined;
  if (event.time !== undefined && (typeof event.time !== "number" || !Number.isFinite(event.time))) return undefined;
  if (event.sourceEventSeqs !== undefined && (!Array.isArray(event.sourceEventSeqs) || event.sourceEventSeqs.some((seq) => typeof seq !== "number" || !Number.isFinite(seq)))) return undefined;
  if (event.ignorable !== undefined && event.ignorable !== true) return undefined;
  return { kind: "event", event: event as unknown as SessionEvent };
}

function mergeSandboxes(existing: SandboxRecord[], incoming: SandboxRecord[]): SandboxRecord[] {
  const byId = new Map(existing.map((sandbox) => [sandbox.id, sandbox]));
  for (const sandbox of incoming) byId.set(sandbox.id, sandbox);
  return [...byId.values()];
}

export class MtmHarnessRuntime {
  private readonly listeners = new Set<Listener>();
  private readonly apiOrigin: string;
  private readonly accessToken: string | undefined;
  private readonly webSocketFactory: MtmHarnessWebSocketFactory | undefined;
  private readonly storageKeyPrefix: string;
  private readonly client: DshClient;
  private readonly sandboxClient: SandboxClient;
  private snapshot: RuntimeSnapshot = {
    status: "idle",
    messages: [],
    registryStatus: "idle",
    sandboxCatalogStatus: "idle",
    sandboxes: [],
    workspaces: [],
    archivedSessionIds: [],
    sessions: [],
  };
  private sessionId: string | undefined;
  private socket: WebSocket | undefined;
  private connectPromise: Promise<void> | undefined;
  private refreshPromise: Promise<void> | undefined;
  private operationQueue: Promise<void> = Promise.resolve();
  private readonly pendingSockets = new Set<WebSocket>();
  private selectionVersion = 0;
  private sandboxGeneration = 0;
  private disposed = false;

  constructor(apiOrigin: string, options: MtmHarnessRuntimeOptions = {}) {
    this.apiOrigin = normalizeOrigin(apiOrigin);
    this.accessToken = options.accessToken;
    this.webSocketFactory = options.webSocketFactory;
    this.storageKeyPrefix = "mtmharness:v1:session:" + this.apiOrigin;
    this.client = options.client ?? new DshApiClient(apiOrigin, options.accessToken);
    this.sandboxClient = options.sandboxClient ?? new SandboxApiClient(apiOrigin, options.accessToken);
  }

  getSnapshot(): RuntimeSnapshot { return this.snapshot; }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async connect(): Promise<void> {
    this.ensureActive();
    if (this.sessionId && this.socket?.readyState === WebSocket.OPEN && this.snapshot.selectedSessionId === this.sessionId && this.snapshot.operation === undefined) return;
    this.connectPromise ??= this.enqueue(() => this.connectInternal()).finally(() => { this.connectPromise = undefined; });
    return this.connectPromise;
  }

  async refreshRegistry(): Promise<void> {
    this.ensureActive();
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = this.enqueue(() => this.refreshRegistryInternal()).finally(() => { this.refreshPromise = undefined; });
    return this.refreshPromise;
  }

  async selectSandbox(sandboxId: string): Promise<void> {
    this.ensureActive();
    const value = sandboxId.trim();
    if (!value) return;
    await this.enqueue(() => this.selectSandboxInternal(value));
  }

  async createSandbox(name: string): Promise<string> {
    this.ensureActive();
    const value = name.trim();
    if (!value) throw new MtmHarnessError("Sandbox name is required", "sandbox_name_invalid");
    return this.enqueue(() => this.createSandboxInternal(value));
  }

  async selectSession(sessionId: string): Promise<void> {
    this.ensureActive();
    const value = sessionId.trim();
    if (!value) return;
    await this.enqueue(async () => {
      if (this.sessionId === value && this.socket?.readyState === WebSocket.OPEN && this.snapshot.selectedSessionId === value) {
        this.update({ selectedSessionId: value });
        return;
      }
      await this.selectSessionInternal(value);
    });
  }

  async createSession(workspaceId?: string): Promise<string> {
    this.ensureActive();
    return this.enqueue(() => this.createSessionInternal(workspaceId));
  }

  private async createSandboxInternal(name: string): Promise<string> {
    const previous = this.snapshot;
    const generation = this.beginSandboxSwitch("creating-sandbox");
    try {
      const created = await this.sandboxClient.createSandbox(name);
      this.assertSandboxGeneration(generation);
      const selected = await this.sandboxClient.selectSandbox(created.sandbox.id);
      this.assertSandboxGeneration(generation);
      this.applySandboxCatalog(
        { sandboxes: mergeSandboxes(this.snapshot.sandboxes, [created.sandbox, selected]), defaultSandbox: selected },
        selected,
      );
      await this.refreshRegistryInternal("creating-sandbox");
      this.assertSandboxGeneration(generation);
      this.update({ status: "idle", operation: undefined, sandboxError: undefined });
      return selected.id;
    } catch (error) {
      const normalized = normalizeError(error);
      await this.restoreSandboxSnapshot(previous, generation);
      this.update({ status: isAuthError(normalized) ? "auth-required" : "error", operation: undefined, sandboxError: normalized.message, error: normalized.message });
      throw normalized;
    }
  }

  private async selectSandboxInternal(sandboxId: string): Promise<void> {
    const previous = this.snapshot;
    const generation = this.beginSandboxSwitch("switching-sandbox");
    try {
      const selected = await this.sandboxClient.selectSandbox(sandboxId);
      this.assertSandboxGeneration(generation);
      this.applySandboxCatalog(
        { sandboxes: mergeSandboxes(this.snapshot.sandboxes, [selected]), defaultSandbox: selected },
        selected,
      );
      await this.refreshRegistryInternal("switching-sandbox");
      this.assertSandboxGeneration(generation);
      const firstSessionId = this.snapshot.sessions[0]?.sessionId;
      if (firstSessionId !== undefined) await this.selectSessionInternal(firstSessionId);
      this.update({ status: "idle", operation: undefined, sandboxError: undefined });
    } catch (error) {
      const normalized = normalizeError(error);
      await this.restoreSandboxSnapshot(previous, generation);
      this.update({ status: isAuthError(normalized) ? "auth-required" : "error", operation: undefined, sandboxError: normalized.message, error: normalized.message });
      throw normalized;
    }
  }

  private beginSandboxSwitch(operation: "switching-sandbox" | "creating-sandbox"): number {
    const generation = ++this.sandboxGeneration;
    this.selectionVersion += 1;
    this.closeSocket();
    this.sessionId = undefined;
    this.client.setSandboxScope(undefined);
    this.update({
      status: "loading",
      operation,
      sandboxError: undefined,
      selectedSessionId: undefined,
      messages: [],
      workspaces: [],
      archivedSessionIds: [],
      sessions: [],
      registryStatus: "idle",
      registryError: undefined,
    });
    return generation;
  }

  private assertSandboxGeneration(generation: number): void {
    if (generation !== this.sandboxGeneration || this.disposed) throw new MtmHarnessError("Sandbox operation was superseded", "sandbox_operation_superseded");
  }

  private async restoreSandboxSnapshot(previous: RuntimeSnapshot, generation: number): Promise<void> {
    if (generation !== this.sandboxGeneration || this.disposed) return;
    const selected = previous.sandboxes.find((sandbox) => sandbox.id === previous.selectedSandboxId);
    this.sessionId = undefined;
    this.client.setSandboxScope(selected === undefined ? undefined : { sandboxId: selected.id, workspaceId: selected.workspaceId });
    this.snapshot = previous;
    for (const listener of this.listeners) listener(this.snapshot);
    if (previous.selectedSessionId !== undefined) {
      try {
        this.assertSandboxGeneration(generation);
        await this.selectSessionInternal(previous.selectedSessionId);
        this.assertSandboxGeneration(generation);
      } catch {
        // The previous snapshot remains visible and the caller publishes the switch error.
      }
    }
  }

  private applySandboxCatalog(catalog: { sandboxes: SandboxRecord[]; defaultSandbox: SandboxRecord | null }, selected: SandboxRecord): void {
    this.client.setSandboxScope({ sandboxId: selected.id, workspaceId: selected.workspaceId });
    this.update({
      sandboxCatalogStatus: "idle",
      sandboxError: undefined,
      sandboxes: mergeSandboxes(catalog.sandboxes, catalog.defaultSandbox === null ? [] : [catalog.defaultSandbox]),
      selectedSandboxId: selected.id,
      defaultSandboxId: catalog.defaultSandbox?.id,
      workspaceId: selected.workspaceId,
      sandboxLifecycleStatus: selected.status,
    });
  }

  private async ensureSandboxInternal(): Promise<SandboxRecord> {
    const current = this.snapshot.sandboxes.find((sandbox) => sandbox.id === this.snapshot.selectedSandboxId);
    if (current !== undefined) return current;
    this.update({ sandboxCatalogStatus: "loading", sandboxError: undefined });
    try {
      let catalog = await this.sandboxClient.listSandboxes();
      let selected = catalog.defaultSandbox;
      if (selected === null && catalog.sandboxes.length === 0) {
        const created = await this.sandboxClient.createSandbox("Default workspace");
        catalog = { sandboxes: mergeSandboxes(catalog.sandboxes, [created.sandbox]), defaultSandbox: created.defaultSandbox ?? created.sandbox };
        selected = catalog.defaultSandbox;
      }
      if (selected === null) throw new MtmHarnessError("No default sandbox is selected", "sandbox_default_missing");
      this.applySandboxCatalog(catalog, selected);
      return selected;
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ sandboxCatalogStatus: "error", sandboxError: normalized.message, status: isAuthError(normalized) ? "auth-required" : this.snapshot.status });
      throw normalized;
    }
  }

  private async createSessionInternal(workspaceId?: string): Promise<string> {
    this.update({ operation: "creating", error: undefined });
    try {
      const created = await this.client.createSession(workspaceId ? { workspaceId } : {});
      this.upsertSession({
        sessionId: created.sessionId,
        updatedAt: Date.now(),
        running: false,
        blank: true,
        ...(created.agentPreset === undefined ? {} : { agentPreset: created.agentPreset }),
        title: created.sessionId,
      }, workspaceId);
      await this.refreshRegistryInternal("creating").catch(() => undefined);
      this.upsertSession({
        sessionId: created.sessionId,
        updatedAt: Date.now(),
        running: false,
        blank: true,
        ...(created.agentPreset === undefined ? {} : { agentPreset: created.agentPreset }),
        title: this.snapshot.sessions.find((session) => session.sessionId === created.sessionId)?.title ?? created.sessionId,
      }, workspaceId);
      await this.selectSessionInternal(created.sessionId);
      return created.sessionId;
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ operation: undefined, status: isAuthError(normalized) ? "auth-required" : "error", error: normalized.message });
      throw normalized;
    }
  }

  async renameSession(sessionId: string, title: string): Promise<void> {
    this.ensureActive();
    const value = title.trim();
    if (!value) return;
    return this.enqueue(() => this.renameSessionInternal(sessionId, value));
  }

  private async renameSessionInternal(sessionId: string, value: string): Promise<void> {
    this.update({ operation: "renaming", error: undefined });
    try {
      const result = await this.client.renameSession({ sessionId, title: value });
      this.update({
        operation: undefined,
        sessions: this.snapshot.sessions.map((session) => session.sessionId === sessionId ? { ...session, title: result.title, projections: { ...(session.projections ?? { asOfSeq: -1, values: {} }), values: { ...(session.projections?.values ?? {}), title: result.title }, asOfSeq: Math.max(session.projections?.asOfSeq ?? -1, result.seq) } } : session),
      });
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ operation: undefined, status: isAuthError(normalized) ? "auth-required" : "error", error: normalized.message });
      throw normalized;
    }
  }

  async forkSession(sessionId: string, atSeq?: number): Promise<string> {
    this.ensureActive();
    return this.enqueue(() => this.forkSessionInternal(sessionId, atSeq));
  }

  private async forkSessionInternal(sessionId: string, atSeq?: number): Promise<string> {
    this.update({ operation: "forking", error: undefined });
    try {
      const source = this.snapshot.sessions.find((session) => session.sessionId === sessionId);
      const forked = await this.client.forkSession({ sessionId, ...(atSeq === undefined ? {} : { atSeq }) });
      const workspace = this.snapshot.workspaces.find((item) => item.sessionIds.includes(sessionId));
      this.upsertSession({
        sessionId: forked.sessionId,
        updatedAt: Date.now(),
        running: false,
        blank: false,
        parentSessionId: sessionId,
        ...(source?.cwd === undefined ? {} : { cwd: source.cwd }),
        title: source ? source.title + " (1)" : forked.sessionId,
      }, workspace?.workspaceId);
      await this.refreshRegistryInternal("forking").catch(() => undefined);
      this.upsertSession({
        sessionId: forked.sessionId,
        updatedAt: Date.now(),
        running: false,
        blank: false,
        parentSessionId: sessionId,
        ...(source?.cwd === undefined ? {} : { cwd: source.cwd }),
        title: source ? source.title + " (1)" : forked.sessionId,
      }, workspace?.workspaceId);
      await this.selectSessionInternal(forked.sessionId);
      return forked.sessionId;
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ operation: undefined, status: isAuthError(normalized) ? "auth-required" : "error", error: normalized.message });
      throw normalized;
    }
  }

  async prompt(text: string): Promise<void> {
    this.ensureActive();
    const value = text.trim();
    if (!value) return;
    await this.enqueue(() => this.promptInternal(value));
  }

  private async promptInternal(value: string): Promise<void> {
    const localId = "local-" + createRpcId();
    try {
      if (!(this.sessionId && this.socket?.readyState === WebSocket.OPEN && this.snapshot.selectedSessionId === this.sessionId)) await this.connectInternal();
      const sessionId = this.sessionId;
      if (!sessionId) throw new Error("session is not available");
      this.update({ status: "streaming", messages: [...this.snapshot.messages, { id: localId, role: "user", text: value }], error: undefined });
      await this.client.prompt({ sessionId, mode: "queue", content: [{ type: "text", text: value }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ status: isAuthError(normalized) ? "auth-required" : "error", messages: this.snapshot.messages.filter((message) => message.id !== localId), error: normalized.message });
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.closeSocket();
    for (const socket of this.pendingSockets) this.closeSocketInstance(socket);
    this.pendingSockets.clear();
    this.listeners.clear();
  }

  private async connectInternal(): Promise<void> {
    this.update({ status: "loading", error: undefined });
    try {
      await this.refreshRegistryInternal();
      const storedSessionId = this.readStoredSessionId();
      let selectedId = storedSessionId && this.snapshot.sessions.some((session) => session.sessionId === storedSessionId) ? storedSessionId : undefined;
      if (!selectedId && storedSessionId) {
        try {
          const restored = await this.client.createSession({ sessionId: storedSessionId });
          selectedId = restored.sessionId;
          this.upsertSession({ sessionId: restored.sessionId, updatedAt: Date.now(), running: false, blank: true, title: restored.sessionId });
        } catch (error) {
          const normalized = normalizeError(error);
          if (isAuthError(normalized)) throw normalized;
          this.clearStoredSessionId();
        }
      }
      if (!selectedId) selectedId = this.snapshot.sessions[0]?.sessionId;
      if (!selectedId) {
        this.update({ operation: "creating" });
        const workspaceId = this.snapshot.workspaces[0]?.workspaceId;
        const created = await this.client.createSession(workspaceId ? { workspaceId } : {});
        selectedId = created.sessionId;
        this.upsertSession({ sessionId: selectedId, updatedAt: Date.now(), running: false, blank: true, title: selectedId }, workspaceId);
      }
      await this.selectSessionInternal(selectedId);
      this.update({ status: "idle", error: undefined, operation: undefined });
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ status: isAuthError(normalized) ? "auth-required" : "error", registryStatus: this.snapshot.registryStatus === "loading" ? "error" : this.snapshot.registryStatus, registryError: this.snapshot.registryError ?? normalized.message, operation: undefined, error: normalized.message });
      throw normalized;
    }
  }

  private async refreshRegistryInternal(operation: RuntimeOperation = "refreshing"): Promise<void> {
    this.update({ registryStatus: "loading", registryError: undefined, operation });
    try {
      await this.ensureSandboxInternal();
      const [workspaces, sessions] = await Promise.all([this.client.listWorkspaces(), this.client.listSessions()]);
      this.update({ workspaces: workspaces.items, archivedSessionIds: workspaces.archivedSessionIds, sessions: sessions.items, registryStatus: "idle", registryError: undefined, operation: undefined });
    } catch (error) {
      const normalized = normalizeError(error);
      this.update({ registryStatus: "error", registryError: normalized.message, operation: undefined, status: isAuthError(normalized) ? "auth-required" : this.snapshot.status, error: normalized.message });
      throw normalized;
    }
  }

  private async selectSessionInternal(sessionId: string): Promise<void> {
    const previousSessionId = this.sessionId;
    const previousSelectedSessionId = this.snapshot.selectedSessionId;
    const previousMessages = this.snapshot.messages;
    const previousSelectionVersion = this.selectionVersion;
    const version = ++this.selectionVersion;
    let nextSocket: WebSocket | undefined;
    this.sessionId = sessionId;
    this.update({ selectedSessionId: sessionId, status: "loading", messages: [], error: undefined, operation: "selecting" });
    try {
      const history = await this.client.loadHistory({ sessionId, maxMessages: 50 });
      if (version !== this.selectionVersion || this.disposed) return;
      this.update({ messages: foldHistory(history.events) });
      nextSocket = await this.openSocket(sessionId, version);
      if (version !== this.selectionVersion || this.disposed) {
        this.closeSocketInstance(nextSocket);
        return;
      }
      const previousSocket = this.socket;
      this.socket = nextSocket;
      nextSocket = undefined;
      this.storeSessionId(sessionId);
      if (previousSocket && previousSocket !== this.socket) this.closeSocketInstance(previousSocket);
      this.update({ status: "idle", operation: undefined, error: undefined });
    } catch (error) {
      if (nextSocket) this.closeSocketInstance(nextSocket);
      if (version !== this.selectionVersion || this.disposed) return;
      const normalized = normalizeError(error);
      this.selectionVersion = previousSelectionVersion;
      this.sessionId = previousSessionId;
      if (previousSessionId) this.storeSessionId(previousSessionId);
      else this.clearStoredSessionId();
      this.update({
        selectedSessionId: previousSelectedSessionId,
        status: isAuthError(normalized) ? "auth-required" : "error",
        messages: previousMessages,
        operation: undefined,
        error: normalized.message,
      });
      throw normalized;
    }
  }

  private async openSocket(sessionId: string, version: number): Promise<WebSocket> {
    const url = new URL("/api/dsh/events.mux", this.apiOrigin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const scope = this.currentSandboxScope();
    if (scope === undefined) throw new MtmHarnessError("Sandbox scope is required", "sandbox_scope_required");
    const accessToken = this.accessToken;
    const webSocketFactory = this.webSocketFactory;
    if (accessToken === undefined) throw new MtmHarnessError("An OAuth access token is required", "auth_required");
    if (webSocketFactory === undefined) {
      throw new MtmHarnessError("A token-aware WebSocket factory is required for streaming", "websocket_auth_required");
    }
    url.searchParams.set("sandboxId", scope.sandboxId);
    let socket: WebSocket;
    try {
      socket = await webSocketFactory(url, accessToken);
    } catch (error) {
      throw new MtmHarnessError(error instanceof Error ? error.message : "Unable to create the conversation stream", "websocket_auth_failed");
    }
    return new Promise((resolve, reject) => {
      this.pendingSockets.add(socket);
      let settled = false;
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        this.pendingSockets.delete(socket);
        this.closeSocketInstance(socket);
        reject(new MtmHarnessError(message));
      };
      socket.onopen = () => {
        if (settled) return;
        settled = true;
        this.pendingSockets.delete(socket);
        resolve(socket);
      };
      socket.onmessage = (event) => this.handleSocketMessage(event.data, sessionId, version);
      socket.onerror = () => { if (!settled) fail("Unable to connect to the conversation stream"); };
      socket.onclose = () => {
        this.pendingSockets.delete(socket);
        if (!settled) {
          settled = true;
          reject(new MtmHarnessError("The conversation stream closed"));
          return;
        }
        if (!this.disposed && this.sessionId === sessionId && this.selectionVersion === version && this.socket === socket && this.snapshot.status === "streaming") {
          this.socket = undefined;
          this.update({ status: "error", error: "The conversation stream was disconnected" });
        }
      };
    });
  }

  private handleSocketMessage(raw: unknown, sessionId: string, version: number): void {
    if (this.sessionId !== sessionId || this.selectionVersion !== version) return;
    const frame = parseSocketFrame(raw, sessionId);
    if (frame === undefined) return;
    if (frame.kind === "agent-error") {
      this.update({ status: "error", error: frame.message });
      return;
    }
    const event = frame.event;
    const data = event.data && typeof event.data === "object" ? event.data as JsonRecord : {};
    const reason = data.reason;
    const failed = event.type === "turn/end" && reason && typeof reason === "object" && (reason as JsonRecord).kind === "error";
    this.update({
      status: failed ? "error" : event.type === "assistant/chunk" ? "streaming" : event.type === "turn/end" ? "idle" : this.snapshot.status,
      messages: applySessionEvent(this.snapshot.messages, event),
      error: failed ? "The agent could not complete the conversation." : this.snapshot.error,
      sessions: this.snapshot.sessions.map((session) => session.sessionId === sessionId ? { ...session, running: event.type !== "turn/end", updatedAt: Date.now() } : session),
    });
  }

  private update(patch: Partial<RuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch, messages: patch.messages ?? this.snapshot.messages };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private upsertSession(session: MtmSessionSummary, workspaceId?: string): void {
    const existing = this.snapshot.sessions.some((item) => item.sessionId === session.sessionId);
    const sessions = existing ? this.snapshot.sessions.map((item) => item.sessionId === session.sessionId ? { ...item, ...session } : item) : [session, ...this.snapshot.sessions];
    const workspaces = workspaceId === undefined ? this.snapshot.workspaces : this.snapshot.workspaces.map((workspace) => workspace.workspaceId === workspaceId && !workspace.sessionIds.includes(session.sessionId) ? { ...workspace, sessionIds: [...workspace.sessionIds, session.sessionId] } : workspace);
    this.update({ sessions, workspaces });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operationQueue.then(() => {
      this.ensureActive();
      return operation();
    }, () => {
      this.ensureActive();
      return operation();
    });
    this.operationQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("runtime has been disposed");
  }

  private closeSocketInstance(socket: WebSocket): void {
    if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "client disposed");
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = undefined;
    if (socket) this.closeSocketInstance(socket);
  }

  private currentSandboxScope(): { sandboxId: string; workspaceId: string } | undefined {
    const selected = this.snapshot.sandboxes.find((sandbox) => sandbox.id === this.snapshot.selectedSandboxId);
    return selected === undefined ? undefined : { sandboxId: selected.id, workspaceId: selected.workspaceId };
  }

  private sessionStorageKey(): string | undefined {
    return this.snapshot.selectedSandboxId === undefined ? undefined : this.storageKeyPrefix + ":" + this.snapshot.selectedSandboxId;
  }

  private readStoredSessionId(): string | undefined {
    const key = this.sessionStorageKey();
    if (key === undefined) return undefined;
    try { return localStorage.getItem(key) ?? undefined; } catch { return undefined; }
  }

  private storeSessionId(sessionId: string): void {
    const key = this.sessionStorageKey();
    if (key === undefined) return;
    try { localStorage.setItem(key, sessionId); } catch { /* optional browser storage */ }
  }

  private clearStoredSessionId(): void {
    const key = this.sessionStorageKey();
    if (key === undefined) return;
    try { localStorage.removeItem(key); } catch { /* optional browser storage */ }
  }
}
