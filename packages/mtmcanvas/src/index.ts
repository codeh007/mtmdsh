import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-connection";
import { FsError, FsVersion } from "@deepseek-ai/dsh-fs";
import type {} from "@deepseek-ai/dsh-fs";
import type {} from "@deepseek-ai/dsh-host-directory-picker";
import { MTM_CANVAS_CHANNEL, parseCanvasRpcRequest } from "./contract/rpc.ts";
import { validateCanvasDocument, type CanvasDocument } from "./contract/canvas.ts";

const CANVAS_DIRECTORY = ".mtmcanvas";
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.canvas$/u;

type RpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: "internal"; message: string; details: Record<string, never> } };

function errorText(error: unknown): string {
  const value = error as { code?: unknown };
  const message = error instanceof Error ? error.message : String(error);
  return typeof value.code === "string" && value.code !== "internal" ? value.code + ": " + message : message;
}

function failure(error: unknown): RpcResult<never> {
  return { ok: false, error: { code: "internal", message: errorText(error), details: {} } };
}

function checkName(name: string): void {
  if (!NAME.test(name) || name.includes("..")) throw new Error("canvas name must be a direct .canvas child");
}

function canvasIdForName(name: string): string {
  return name.slice(0, -".canvas".length);
}

function assertDocumentName(name: string, document: CanvasDocument): void {
  if (document.canvasId !== canvasIdForName(name)) throw new Error("canvas document id does not match its file name");
}

function childPath(parent: string, name: string): string {
  return parent.endsWith("/") ? parent + name : parent + "/" + name;
}

async function ensureDirectory(ctx: Context, signal: AbortSignal): Promise<Awaited<ReturnType<typeof ctx.fs.resolve>>> {
  const workspace = await ctx.fs.resolve(".", { signal });
  const rootPath = childPath(workspace.displayPath, CANVAS_DIRECTORY);
  const target = await ctx.fs.resolve(rootPath, { signal });
  const current = await ctx.fs.stat(target, signal);
  if (current?.type === "directory") return target;
  if (current !== undefined) throw new Error("canvas storage path is not a directory");

  const capability = ctx.directoryPicker.capability();
  if (capability.kind !== "browse") throw new Error("canvas storage directory cannot be created by this Host");
  try {
    const createdPath = await capability.createDirectory(workspace.displayPath, CANVAS_DIRECTORY);
    if (createdPath !== rootPath) throw new Error("canvas storage directory was created at an unexpected path");
  } catch (error) {
    const raced = await ctx.fs.stat(target, signal);
    if (raced?.type !== "directory") throw error;
  }
  return target;
}

async function readDocument(ctx: Context, directory: Awaited<ReturnType<typeof ctx.fs.resolve>>, name: string, signal: AbortSignal): Promise<{ version: string; document: CanvasDocument }> {
  checkName(name);
  const target = await ctx.fs.resolve(childPath(directory.displayPath, name), { signal });
  const before = await ctx.fs.stat(target, signal);
  if (before === undefined) throw new FsError("canvas document was not found", "FS_NOT_FOUND");
  if (before.type !== "file") throw new FsError("canvas document is not a regular file", "FS_NOT_REGULAR_FILE");
  const raw = JSON.parse(await ctx.fs.readText(target, signal)) as unknown;
  const document = validateCanvasDocument(raw);
  assertDocumentName(name, document);
  const after = await ctx.fs.stat(target, signal);
  if (after?.type !== "file") throw new FsError("canvas document disappeared while reading", "FS_NOT_FOUND");
  if (String(before.version) !== String(after.version)) throw new FsError("canvas document changed while reading", "FS_STALE_VERSION");
  return { version: String(after.version), document };
}

export const name = "mtmcanvas";
export const inject = ["connection", "fs", "directoryPicker"];

export function createCanvasRpcHandler(ctx: Context) {
  return async (endpoint: string, payload: unknown, signal: AbortSignal): Promise<RpcResult<unknown>> => {
    if (endpoint !== "request") return failure(new Error("unknown canvas endpoint"));
    try {
      const request = parseCanvasRpcRequest((payload as { args?: unknown } | null)?.args);
      if (request.kind !== "list") checkName(request.name);
      const directory = await ensureDirectory(ctx, signal);
      if (request.kind === "list") {
        const entries = await ctx.fs.listDir(directory, signal);
        return {
          ok: true,
          value: entries
            .filter((entry) => entry.type === "file" && NAME.test(entry.name))
            .map((entry) => ({ name: entry.name, version: String(entry.version) })),
        };
      }

      const target = await ctx.fs.resolve(childPath(directory.displayPath, request.name), { signal });
      if (request.kind === "read") return { ok: true, value: { name: request.name, ...(await readDocument(ctx, directory, request.name, signal)) } };

      const document = validateCanvasDocument(request.document);
      assertDocumentName(request.name, document);
      const content = JSON.stringify(document);
      const outcome =
        request.kind === "create"
          ? await ctx.fs.writeText(target, content, { kind: "createIfAbsent" }, signal)
          : await ctx.fs.writeText(target, content, { kind: "replaceIfVersion", version: FsVersion(request.version) }, signal);
      return { ok: true, value: { name: request.name, version: String(outcome.version), document } };
    } catch (error) {
      return failure(error);
    }
  };
}

/** Mount the file-backed Canvas RPC on the existing loopback Connection seam. */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const remove = ctx.connection.rpc.handle(MTM_CANVAS_CHANNEL, createCanvasRpcHandler(ctx), { authority: "loopback" });
    return remove;
  }, "mtm-canvas: file-backed RPC");
}
