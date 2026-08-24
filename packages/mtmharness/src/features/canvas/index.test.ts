import { FsVersion } from "@deepseek-ai/dsh-fs";
import { describe, expect, it } from "vitest";
import { createCanvasDocument } from "./contract/canvas.ts";
import { createCanvasRpcHandler } from "./index.ts";

const ROOT = "/workspace/.mtmcanvas";

type Stored = { content: string; version: number };

function bench() {
  const files = new Map<string, Stored>();
  let rootExists = false;
  let revision = 0;
  const fs = {
    async resolve(displayPath: string) { return { targetKey: displayPath, displayPath }; },
    async stat(target: { displayPath: string }) {
      if (target.displayPath === ROOT) return rootExists ? { type: "directory", version: FsVersion("root") } : undefined;
      const stored = files.get(target.displayPath);
      return stored === undefined ? undefined : { type: "file", version: FsVersion("v" + stored.version), size: stored.content.length };
    },
    async listDir(target: { displayPath: string }) {
      if (!rootExists || target.displayPath !== ROOT) throw new Error("directory missing");
      return [...files.entries()].map(([path, stored]) => ({ name: path.slice(ROOT.length + 1), type: "file", target: { targetKey: path, displayPath: path }, version: FsVersion("v" + stored.version), size: stored.content.length }));
    },
    async readText(target: { displayPath: string }) {
      const stored = files.get(target.displayPath);
      if (stored === undefined) throw new Error("file missing");
      return stored.content;
    },
    async writeText(target: { displayPath: string }, content: string, expected?: { kind: string; version?: unknown }) {
      const current = files.get(target.displayPath);
      if (expected?.kind === "createIfAbsent" && current !== undefined) throw Object.assign(new Error("exists"), { code: "FS_NOT_OBSERVED" });
      if (expected?.kind === "replaceIfVersion" && String(expected.version) !== "v" + current?.version) throw Object.assign(new Error("changed"), { code: "FS_STALE_VERSION" });
      revision += 1;
      files.set(target.displayPath, { content, version: revision });
      return { operation: current === undefined ? "create" : "update", version: FsVersion("v" + revision), before: current?.content ?? null, after: content };
    },
  };
  const directoryPicker = { capability: () => ({ kind: "browse", list: async () => ({}) , createDirectory: async () => { rootExists = true; return ROOT; } }) };
  const handler = createCanvasRpcHandler({ fs, directoryPicker } as never);
  return { files, handler };
}

async function request(handler: ReturnType<typeof createCanvasRpcHandler>, args: unknown) {
  return handler("request", { args }, new AbortController().signal);
}

describe("Canvas filesystem RPC", () => {
  it("initializes the directory, creates, lists, and reads a canvas file", async () => {
    const { handler } = bench();
    const created = await request(handler, { kind: "create", name: "demo.canvas", document: createCanvasDocument("demo") });
    expect(created.ok).toBe(true);
    await expect(request(handler, { kind: "list" })).resolves.toMatchObject({ ok: true, value: [{ name: "demo.canvas" }] });
    await expect(request(handler, { kind: "read", name: "demo.canvas" })).resolves.toMatchObject({ ok: true, value: { name: "demo.canvas" } });
  });

  it("returns an internal RPC failure for stale file versions", async () => {
    const { handler } = bench();
    const created = await request(handler, { kind: "create", name: "demo.canvas", document: createCanvasDocument("demo") });
    if (!created.ok) throw new Error("create failed");
    const document = createCanvasDocument("demo");
    await expect(request(handler, { kind: "write", name: "demo.canvas", version: "stale", document })).resolves.toMatchObject({ ok: false, error: { code: "internal", message: expect.stringContaining("FS_STALE_VERSION") } });
  });

  it("rejects path traversal names", async () => {
    const { handler } = bench();
    await expect(request(handler, { kind: "read", name: "../escape.canvas" })).resolves.toMatchObject({ ok: false, error: { code: "internal" } });
  });
});
