import type { SandboxScope } from "@/sandbox/adapter";

export class DshApiError extends Error {
  constructor(message: string, readonly code?: string, readonly details?: unknown) {
    super(message);
    this.name = "DshApiError";
  }
}

export interface DshSessionEvent {
  type: string;
  seq?: number;
  time?: number;
  data?: unknown;
  sourceEventSeqs?: number[];
  surfaceOp?: unknown;
  ignorable?: true;
}

export interface DshHistoryEntry {
  event: DshSessionEvent;
  view?: unknown;
}

export interface DshSessionProjectionBlock {
  asOfSeq: number;
  values: Record<string, unknown>;
}

export interface DshSessionSummary {
  sessionId: string;
  updatedAt: number;
  running: boolean;
  blank: boolean;
  parentSessionId?: string;
  origin?: "subagent";
  cwd?: string;
  agentPreset?: string;
  projections?: DshSessionProjectionBlock;
}

export interface MtmSessionSummary extends DshSessionSummary {
  title: string;
}

export interface DshWorkspaceView {
  workspaceId: string;
  path: string;
  title: string;
  sessionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DshWorkspaceListValue {
  items: DshWorkspaceView[];
  archivedSessionIds: string[];
}

export interface DshSessionListValue {
  items: MtmSessionSummary[];
}

export interface DshSessionCreateValue {
  sessionId: string;
  agentPreset?: string;
}

export interface DshSessionHistoryValue {
  events: DshHistoryEntry[];
  hasMore: boolean;
  projections?: DshSessionProjectionBlock;
}

export interface DshSessionRenameValue {
  title: string;
  seq: number;
}

export interface DshSessionForkValue {
  sessionId: string;
}

export interface CreateSessionInput {
  workspaceId?: string;
  cwd?: string;
  sessionId?: string;
  agentPreset?: string;
}

export interface DshClient {
  setSandboxScope(scope: SandboxScope | undefined): void;
  listWorkspaces(signal?: AbortSignal): Promise<DshWorkspaceListValue>;
  listSessions(signal?: AbortSignal): Promise<DshSessionListValue>;
  createSession(input?: CreateSessionInput, signal?: AbortSignal): Promise<DshSessionCreateValue>;
  loadHistory(input: { sessionId: string; maxMessages?: number; beforeSeq?: number }, signal?: AbortSignal): Promise<DshSessionHistoryValue>;
  renameSession(input: { sessionId: string; title: string }, signal?: AbortSignal): Promise<DshSessionRenameValue>;
  forkSession(input: { sessionId: string; atSeq?: number }, signal?: AbortSignal): Promise<DshSessionForkValue>;
  prompt(input: { sessionId: string; mode: "queue" | "steer"; content: [{ type: "text"; text: string }]; clientTimeZone?: string }, signal?: AbortSignal): Promise<Record<string, unknown>>;
}

type JsonRecord = Record<string, unknown>;
type Parser<T> = (value: unknown) => T;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function record(value: unknown, label: string): JsonRecord {
  if (!isRecord(value)) throw new DshApiError("The server returned an invalid " + label);
  return value;
}

function requiredString(value: JsonRecord, key: string, label: string): string {
  if (typeof value[key] !== "string" || value[key].length === 0) throw new DshApiError("The server returned an invalid " + label);
  return value[key];
}

function optionalString(value: JsonRecord, key: string, label: string): string | undefined {
  if (value[key] === undefined) return undefined;
  return requiredString(value, key, label);
}

function requiredFiniteNumber(value: JsonRecord, key: string, label: string): number {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new DshApiError("The server returned an invalid " + label);
  return value[key];
}

function optionalFiniteNumber(value: JsonRecord, key: string, label: string): number | undefined {
  if (value[key] === undefined) return undefined;
  return requiredFiniteNumber(value, key, label);
}

function requiredBoolean(value: JsonRecord, key: string, label: string): boolean {
  if (typeof value[key] !== "boolean") throw new DshApiError("The server returned an invalid " + label);
  return value[key];
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.length === 0)) {
    throw new DshApiError("The server returned an invalid " + label);
  }
  return [...value];
}

function projectionBlock(value: unknown, label: string): DshSessionProjectionBlock {
  const item = record(value, label);
  const asOfSeq = requiredFiniteNumber(item, "asOfSeq", label + ".asOfSeq");
  if (!Number.isInteger(asOfSeq) || asOfSeq < -1) throw new DshApiError("The server returned an invalid " + label + ".asOfSeq");
  return { asOfSeq, values: record(item.values, label + ".values") };
}

function sessionTitle(summary: DshSessionSummary): string {
  const title = summary.projections?.values.title;
  if (typeof title === "string" && title.length > 0) return title;
  if (summary.cwd) {
    const basename = summary.cwd.replace(/[\\/]+$/u, "").split(/[\\/]/u).pop();
    if (basename) return basename;
  }
  return summary.sessionId;
}

function parseSessionSummary(value: unknown): MtmSessionSummary {
  const item = record(value, "session summary");
  const summary: DshSessionSummary = {
    sessionId: requiredString(item, "sessionId", "session summary.sessionId"),
    updatedAt: requiredFiniteNumber(item, "updatedAt", "session summary.updatedAt"),
    running: requiredBoolean(item, "running", "session summary.running"),
    blank: requiredBoolean(item, "blank", "session summary.blank"),
  };
  const parentSessionId = optionalString(item, "parentSessionId", "session summary.parentSessionId");
  const cwd = optionalString(item, "cwd", "session summary.cwd");
  const agentPreset = optionalString(item, "agentPreset", "session summary.agentPreset");
  const origin = item.origin === undefined ? undefined : item.origin === "subagent" ? "subagent" : undefined;
  if (item.origin !== undefined && origin === undefined) throw new DshApiError("The server returned an invalid session summary.origin");
  const projections = item.projections === undefined ? undefined : projectionBlock(item.projections, "session summary.projections");
  if (parentSessionId !== undefined) summary.parentSessionId = parentSessionId;
  if (origin !== undefined) summary.origin = origin;
  if (cwd !== undefined) summary.cwd = cwd;
  if (agentPreset !== undefined) summary.agentPreset = agentPreset;
  if (projections !== undefined) summary.projections = projections;
  return { ...summary, title: sessionTitle(summary) };
}

function parseWorkspace(value: unknown): DshWorkspaceView {
  const item = record(value, "workspace");
  return {
    workspaceId: requiredString(item, "workspaceId", "workspace.workspaceId"),
    path: requiredString(item, "path", "workspace.path"),
    title: requiredString(item, "title", "workspace.title"),
    sessionIds: stringArray(item.sessionIds, "workspace.sessionIds"),
    createdAt: requiredString(item, "createdAt", "workspace.createdAt"),
    updatedAt: requiredString(item, "updatedAt", "workspace.updatedAt"),
  };
}

function parseWorkspaceList(value: unknown): DshWorkspaceListValue {
  const item = record(value, "workspace.list response");
  if (!Array.isArray(item.items)) throw new DshApiError("The server returned an invalid workspace.list items");
  return { items: item.items.map((workspace) => parseWorkspace(workspace)), archivedSessionIds: stringArray(item.archivedSessionIds, "workspace.list archivedSessionIds") };
}

function parseSessionList(value: unknown): DshSessionListValue {
  const item = record(value, "session.list response");
  if (!Array.isArray(item.items)) throw new DshApiError("The server returned an invalid session.list items");
  return { items: item.items.map((session) => parseSessionSummary(session)) };
}

function parseEvent(value: unknown): DshSessionEvent {
  const item = record(value, "session event");
  const event: DshSessionEvent = { type: requiredString(item, "type", "session event.type") };
  const seq = optionalFiniteNumber(item, "seq", "session event.seq");
  const time = optionalFiniteNumber(item, "time", "session event.time");
  if (seq !== undefined) event.seq = seq;
  if (time !== undefined) event.time = time;
  if (item.data !== undefined) event.data = item.data;
  if (item.sourceEventSeqs !== undefined) {
    if (!Array.isArray(item.sourceEventSeqs) || item.sourceEventSeqs.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) throw new DshApiError("The server returned an invalid session event.sourceEventSeqs");
    event.sourceEventSeqs = [...item.sourceEventSeqs];
  }
  if (item.surfaceOp !== undefined) event.surfaceOp = item.surfaceOp;
  if (item.ignorable !== undefined) {
    if (item.ignorable !== true) throw new DshApiError("The server returned an invalid session event.ignorable");
    event.ignorable = true;
  }
  return event;
}

function parseHistory(value: unknown): DshSessionHistoryValue {
  const item = record(value, "session.history response");
  if (!Array.isArray(item.events)) throw new DshApiError("The server returned an invalid session.history events");
  const events = item.events.map((entry) => {
    const historyEntry = record(entry, "session history entry");
    return { event: parseEvent(historyEntry.event), ...(historyEntry.view === undefined ? {} : { view: historyEntry.view }) };
  });
  if (typeof item.hasMore !== "boolean") throw new DshApiError("The server returned an invalid session.history hasMore");
  return { events, hasMore: item.hasMore, ...(item.projections === undefined ? {} : { projections: projectionBlock(item.projections, "session.history projections") }) };
}

function parseCreate(value: unknown): DshSessionCreateValue {
  const item = record(value, "session.create response");
  const agentPreset = optionalString(item, "agentPreset", "session.create agentPreset");
  return { sessionId: requiredString(item, "sessionId", "session.create sessionId"), ...(agentPreset === undefined ? {} : { agentPreset }) };
}

function parseRename(value: unknown): DshSessionRenameValue {
  const item = record(value, "session.rename response");
  const title = requiredString(item, "title", "session.rename title");
  const seq = requiredFiniteNumber(item, "seq", "session.rename seq");
  if (!Number.isInteger(seq) || seq < 0) throw new DshApiError("The server returned an invalid session.rename seq");
  return { title, seq };
}

function parseFork(value: unknown): DshSessionForkValue {
  const item = record(value, "session.fork response");
  return { sessionId: requiredString(item, "sessionId", "session.fork sessionId") };
}

function parseObjectValue(value: unknown, label: string): Record<string, unknown> {
  return record(value, label);
}

function parseEnvelope(value: unknown): unknown {
  const body = record(value, "response");
  const result = record(body.result, "result");
  if (result.ok !== true) {
    const error = record(result.error, "operation error");
    throw new DshApiError(typeof error.message === "string" ? error.message : "The DSH operation failed", typeof error.code === "string" ? error.code : undefined, error.details);
  }
  return result.value;
}

export class DshApiClient implements DshClient {
  private readonly apiOrigin: string;
  private readonly accessToken: string | undefined;
  private sandboxScope: SandboxScope | undefined;

  constructor(apiOrigin: string, accessToken?: string) {
    this.apiOrigin = new URL(apiOrigin).origin;
    this.accessToken = accessToken;
  }

  setSandboxScope(scope: SandboxScope | undefined): void {
    this.sandboxScope = scope;
  }

  listWorkspaces(signal?: AbortSignal): Promise<DshWorkspaceListValue> {
    return this.call("workspace.list", {}, parseWorkspaceList, signal);
  }

  listSessions(signal?: AbortSignal): Promise<DshSessionListValue> {
    return this.call("session.list", {}, parseSessionList, signal);
  }

  createSession(input: CreateSessionInput = {}, signal?: AbortSignal): Promise<DshSessionCreateValue> {
    return this.call("session.create", input, parseCreate, signal);
  }

  loadHistory(input: { sessionId: string; maxMessages?: number; beforeSeq?: number }, signal?: AbortSignal): Promise<DshSessionHistoryValue> {
    return this.call("session.history", input, parseHistory, signal);
  }

  renameSession(input: { sessionId: string; title: string }, signal?: AbortSignal): Promise<DshSessionRenameValue> {
    return this.call("session.rename", input, parseRename, signal);
  }

  forkSession(input: { sessionId: string; atSeq?: number }, signal?: AbortSignal): Promise<DshSessionForkValue> {
    return this.call("session.fork", input, parseFork, signal);
  }

  prompt(input: { sessionId: string; mode: "queue" | "steer"; content: [{ type: "text"; text: string }]; clientTimeZone?: string }, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.call("session.prompt", input, (value) => parseObjectValue(value, "session.prompt response"), signal);
  }

  private async call<T>(method: string, payload: unknown, parser: Parser<T>, signal?: AbortSignal): Promise<T> {
    let response: Response;
    try {
      const target = new URL(`/api/dsh/${method}`, this.apiOrigin);
      if (this.sandboxScope !== undefined) target.searchParams.set("sandboxId", this.sandboxScope.sandboxId);
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (this.accessToken !== undefined) headers.authorization = "Bearer " + this.accessToken;
      response = await fetch(target, {
        method: "POST",
        credentials: "omit",
        headers,
        body: JSON.stringify({ type: "client-request", rpcId: createRpcId(), method, payload }),
        signal,
      });
    } catch (error) {
      if (error instanceof DshApiError) throw error;
      throw new DshApiError("Unable to reach the MTM Harness service", undefined, error);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => undefined);
      const error = isRecord(body) && isRecord(body.error) ? body.error : {};
      throw new DshApiError(typeof error.message === "string" ? error.message : "The DSH request failed", typeof error.code === "string" ? error.code : undefined, error.details);
    }
    const body = await response.json().catch(() => undefined);
    return parser(parseEnvelope(body));
  }

}

function createRpcId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
