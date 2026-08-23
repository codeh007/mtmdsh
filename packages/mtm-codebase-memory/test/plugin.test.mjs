import assert from "node:assert/strict";
import test from "node:test";
import { apply, name } from "../dist/index.js";

function createContext() {
  const listeners = new Map();
  const sections = [];
  const injected = [];
  const spawnSpecs = [];
  const effects = [];
  let nested;
  const on = (event, callback) => {
    const current = listeners.get(event) ?? [];
    current.push(callback);
    listeners.set(event, current);
  };
  const context = {
    systemPrompt: {
      section(section) {
        sections.push(section);
        return () => {};
      },
    },
    plugin: async (plugin, config) => {
      nested = { plugin, config };
    },
    subprocess: {
      spawn(spec) {
        spawnSpecs.push(spec);
        const isHook = spec.argv.at(-1) === "hook-augment";
        const stdout = isHook
          ? JSON.stringify({ hookSpecificOutput: { additionalContext: "CBM context" } })
          : "";
        const reader = { readFrom: () => ({ text: stdout, nextOffset: stdout.length, lossy: false }) };
        return {
          collected: { stdout: reader, stderr: { readFrom: () => ({ text: "", nextOffset: 0, lossy: false }) } },
          done: Promise.resolve({ exitCode: 0, signal: null }),
          terminate() {},
          waitForExit: async () => true,
        };
      },
    },
    logger: { debug() {} },
    effect(execute) {
      const disposer = execute();
      effects.push(disposer);
      return async () => { if (typeof disposer === "function") await disposer(); };
    },
    on,
  };
  return { context, listeners, sections, injected, spawnSpecs, effects, getNested: () => nested };
}

function listener(registry, event) {
  const callbacks = registry.get(event) ?? [];
  assert.equal(callbacks.length, 1, "expected one " + event + " listener");
  return callbacks[0];
}

test("apply nests the official MCP client and registers graph guidance", async () => {
  const fake = createContext();
  await apply(fake.context, {
    command: "/controlled/codebase-memory-mcp",
    ensureRuntime: false,
    augmentHooks: false,
  });
  const nested = fake.getNested();
  assert.equal(nested.plugin.name, "mcp-client");
  assert.equal(nested.config.transport, "stdio");
  assert.equal(nested.config.command, "/controlled/codebase-memory-mcp");
  assert.deepEqual(nested.config.args, []);
  assert.equal(fake.sections.length, 1);
  assert.equal(fake.sections[0].name, name + ":guidance");
  assert.match(fake.sections[0].text, /search_graph/);
});

test("session and search/read hooks become logged DSH contexts", async () => {
  const fake = createContext();
  await apply(fake.context, {
    command: "/controlled/codebase-memory-mcp",
    ensureRuntime: false,
  });
  const agent = {
    session: { header: { cwd: "/workspace/example" } },
    inject(message) { fake.injected.push(message); },
  };
  const sessionStart = listener(fake.listeners, "agent/session-start");
  sessionStart({ agent });
  const preStep = listener(fake.listeners, "agent/pre-step");
  const direct = { id: "direct", source: { kind: "user" }, content: [{ type: "text", text: "inspect" }] };
  const entered = await preStep(
    { agent, messages: [direct], step: 1, signal: new AbortController().signal },
    async () => ({ kind: "enter", messages: [direct] }),
  );
  assert.equal(entered.kind, "enter");
  assert.equal(entered.messages.length, 2);
  assert.equal(entered.messages[1].source.form, "notice");
  assert.match(entered.messages[1].content[0].text, /CBM context/);
  assert.deepEqual(JSON.parse(fake.spawnSpecs[0].stdio.stdin.data), {
    hook_event_name: "SessionStart",
    cwd: "/workspace/example",
  });
  assert.equal(fake.spawnSpecs[0].env.CBM_HOOK_DEADLINE_MS, "2000");

  const toolPre = listener(fake.listeners, "tools/pre-execute");
  const toolPost = listener(fake.listeners, "tools/post-execute");
  const grep = {
    token: Symbol("grep"),
    agent,
    name: "grep",
    arguments: { pattern: "Context" },
    signal: new AbortController().signal,
  };
  await toolPre(grep, async () => ({ kind: "allow" }));
  const grepResult = await toolPost(grep, { isError: false }, async () => ({ kind: "accept" }));
  assert.equal(grepResult.kind, "accept");
  assert.equal(grepResult.additionalContexts.length, 1);
  assert.equal(grepResult.additionalContexts[0].source.form, "notice");
  assert.deepEqual(JSON.parse(fake.spawnSpecs[1].stdio.stdin.data), {
    hook_event_name: "PreToolUse",
    tool_name: "Grep",
    tool_input: { pattern: "Context" },
    cwd: "/workspace/example",
  });

  const glob = {
    token: Symbol("glob"),
    agent,
    name: "glob",
    arguments: { pattern: "**/*.ts" },
    signal: new AbortController().signal,
  };
  await toolPre(glob, async () => ({ kind: "allow" }));
  await toolPost(glob, { isError: false }, async () => ({ kind: "accept" }));
  assert.equal(JSON.parse(fake.spawnSpecs[2].stdio.stdin.data).tool_name, "Glob");

  const read = {
    token: Symbol("read"),
    agent,
    name: "read",
    arguments: { file_path: "/workspace/example/src/index.ts", offset: 20 },
    signal: new AbortController().signal,
  };
  const readResult = await toolPost(read, { isError: false }, async () => ({ kind: "accept" }));
  assert.equal(readResult.additionalContexts.length, 1);
  assert.deepEqual(JSON.parse(fake.spawnSpecs[3].stdio.stdin.data), {
    hook_event_name: "PostToolUse",
    tool_name: "Read",
    tool_input: { file_path: "/workspace/example/src/index.ts" },
    cwd: "/workspace/example",
  });
  const callsBeforeFailedRead = fake.spawnSpecs.length;
  await toolPost({ ...read, token: Symbol("failed-read") }, { isError: true }, async () => ({ kind: "accept" }));
  assert.equal(fake.spawnSpecs.length, callsBeforeFailedRead);
  assert.deepEqual(fake.spawnSpecs.slice(1).map((spec) => spec.argv.at(-1)), [
    "hook-augment", "hook-augment", "hook-augment",
  ]);

  for (const dispose of fake.effects) await dispose();
});
