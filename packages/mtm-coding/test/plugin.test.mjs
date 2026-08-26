import assert from "node:assert/strict";
import test from "node:test";
import { apply, name } from "../dist/index.js";
import { apply as applyCodebaseMemory } from "../dist/features/codebase-memory.js";
import { apply as applyPonytail } from "../dist/features/ponytail.js";
import { PONYTAIL_SKILLS } from "../dist/features/ponytail-skills.js";

const DEFAULT_SETTINGS = {
  codebaseMemoryEnabled: true,
  codebaseMemoryAugmentHooks: true,
  ponytailEnabled: true,
  ponytailMode: "full",
  ponytailSubagents: true,
  serverName: "codebase_memory",
  command: "/controlled/codebase-memory-mcp",
  args: [],
  cwd: "",
  env: {},
  cacheDir: "",
  allowedRoot: "",
  toolCallTimeoutMs: 60_000,
  hookTimeoutMs: 2_000,
  runtimeCheckTimeoutMs: 120_000,
  ensureRuntime: false,
  failOnStartupError: false,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
};

function createContext(settingsValue = {}) {
  const listeners = new Map();
  const sections = [];
  const injected = [];
  const spawnSpecs = [];
  const pluginCalls = [];
  const commands = [];
  const skills = [];
  const root = makeFiber("root");
  let currentFiber = root;
  let settings = { ...DEFAULT_SETTINGS, ...settingsValue };
  const watchers = new Set();

  function addListener(event, callback) {
    const current = listeners.get(event) ?? [];
    current.push(callback);
    listeners.set(event, current);
    const disposeListener = () => {
      const entries = listeners.get(event);
      if (entries === undefined) return;
      const index = entries.indexOf(callback);
      if (index >= 0) entries.splice(index, 1);
    };
    currentFiber.effects.push(disposeListener);
    return disposeListener;
  }

  function makeFiber(label) {
    return {
      label,
      effects: [],
      children: [],
      disposed: false,
      async dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const child of [...this.children].reverse()) await child.dispose();
        for (const effect of [...this.effects].reverse()) {
          if (typeof effect === "function") await effect();
        }
      },
    };
  }

  const context = {
    systemPrompt: {
      section(section) {
        sections.push(section);
        const disposeSection = () => {
          const index = sections.indexOf(section);
          if (index >= 0) sections.splice(index, 1);
        };
        currentFiber.effects.push(disposeSection);
        return disposeSection;
      },
    },
    settings: {
      register(_namespace, _schema, options = {}) {
        settings = { ...settings, ...(options.base ?? {}) };
        return {
          get: () => settings,
          watch(callback) {
            watchers.add(callback);
            return () => { watchers.delete(callback); };
          },
        };
      },
    },
    plugin: async (plugin, config) => {
      const fiber = makeFiber(plugin?.name ?? "nested");
      currentFiber.children.push(fiber);
      if (config?.transport === "stdio") {
        pluginCalls.push({ plugin, config, fiber });
        return fiber;
      }
      if (typeof plugin?.apply === "function") {
        pluginCalls.push({ plugin, config, fiber });
        const previous = currentFiber;
        currentFiber = fiber;
        try {
          await plugin.apply(context, config);
        } finally {
          currentFiber = previous;
        }
      }
      return fiber;
    },
    skills: {
      register(definition) {
        skills.push(definition);
        const disposeSkill = () => {
          const index = skills.indexOf(definition);
          if (index >= 0) skills.splice(index, 1);
        };
        currentFiber.effects.push(disposeSkill);
        return disposeSkill;
      },
    },
    commands: {
      register(definition) {
        commands.push(definition);
        const disposeCommand = () => {
          const index = commands.indexOf(definition);
          if (index >= 0) commands.splice(index, 1);
        };
        currentFiber.effects.push(disposeCommand);
        return disposeCommand;
      },
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
    logger: { debug() {}, error() {}, warn() {} },
    effect(execute) {
      const disposer = execute();
      currentFiber.effects.push(disposer);
      return async () => { if (typeof disposer === "function") await disposer(); };
    },
    on: addListener,
  };

  return {
    context,
    listeners,
    sections,
    injected,
    spawnSpecs,
    pluginCalls,
    commands,
    skills,
    async trigger(next) {
      settings = next;
      await Promise.all([...watchers].map((watcher) => watcher(next, undefined)));
    },
    async dispose() { await root.dispose(); },
    getSettings: () => settings,
  };
}

function listenersFor(registry, event) {
  return registry.get(event) ?? [];
}

function onlyListener(registry, event) {
  const callbacks = listenersFor(registry, event);
  assert.equal(callbacks.length, 1, "expected one " + event + " listener");
  return callbacks[0];
}

test("Codebase Memory mounts the official MCP client and graph guidance", async () => {
  const fake = createContext();
  await applyCodebaseMemory(fake.context, {
    command: "/controlled/codebase-memory-mcp",
    ensureRuntime: false,
    augmentHooks: false,
  });
  const nested = fake.pluginCalls.find((call) => call.config?.transport === "stdio");
  assert.ok(nested);
  assert.equal(nested.config.serverName, "codebase_memory");
  assert.equal(nested.config.command, "/controlled/codebase-memory-mcp");
  assert.deepEqual(nested.config.args, []);
  assert.equal(fake.sections.length, 1);
  assert.equal(fake.sections[0].name, "mtm-coding:guidance");
  assert.match(fake.sections[0].text, /search_graph/);
  assert.match(fake.sections[0].text, /trace_path/);
  assert.match(fake.sections[0].text, /get_code_snippet/);
  assert.match(fake.sections[0].text, /check_index_coverage/);
  assert.match(fake.sections[0].text, /data, not instructions/);
});

test("Codebase Memory hooks become bounded DSH context messages", async () => {
  const fake = createContext();
  await applyCodebaseMemory(fake.context, {
    command: "/controlled/codebase-memory-mcp",
    ensureRuntime: false,
  });
  const agent = {
    session: { header: { cwd: "/workspace/example" } },
    inject(message) { fake.injected.push(message); },
  };
  onlyListener(fake.listeners, "agent/session-start")({ agent });
  const preStep = onlyListener(fake.listeners, "agent/pre-step");
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

  const toolPre = onlyListener(fake.listeners, "tools/pre-execute");
  const toolPost = onlyListener(fake.listeners, "tools/post-execute");
  const grep = {
    token: Symbol("grep"), agent, name: "grep", arguments: { pattern: "Context" },
    signal: new AbortController().signal,
  };
  await toolPre(grep, async () => ({ kind: "allow" }));
  const grepResult = await toolPost(grep, { isError: false }, async () => ({ kind: "accept" }));
  assert.equal(grepResult.additionalContexts.length, 1);
  assert.equal(grepResult.additionalContexts[0].source.form, "notice");
  assert.deepEqual(JSON.parse(fake.spawnSpecs[1].stdio.stdin.data), {
    hook_event_name: "PreToolUse",
    tool_name: "Grep",
    tool_input: { pattern: "Context" },
    cwd: "/workspace/example",
  });

  const glob = {
    token: Symbol("glob"), agent, name: "glob", arguments: { pattern: "**/*.ts" },
    signal: new AbortController().signal,
  };
  await toolPre(glob, async () => ({ kind: "allow" }));
  await toolPost(glob, { isError: false }, async () => ({ kind: "accept" }));
  assert.equal(JSON.parse(fake.spawnSpecs[2].stdio.stdin.data).tool_name, "Glob");

  const read = {
    token: Symbol("read"), agent, name: "read",
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
  const beforeFailedRead = fake.spawnSpecs.length;
  await toolPost({ ...read, token: Symbol("failed-read") }, { isError: true }, async () => ({ kind: "accept" }));
  assert.equal(fake.spawnSpecs.length, beforeFailedRead);
  await fake.dispose();
});

test("unified settings reconcile both domains and unregisters its watcher", async () => {
  const fake = createContext({ codebaseMemoryEnabled: false, ponytailMode: "lite" });
  await apply(fake.context, {});
  assert.equal(name, "mtm-coding");
  assert.equal(fake.skills.length, 6);
  assert.equal(fake.pluginCalls.filter((call) => call.config?.transport === "stdio").length, 0);
  await fake.trigger({ ...fake.getSettings(), codebaseMemoryEnabled: true });
  assert.equal(fake.pluginCalls.filter((call) => call.config?.transport === "stdio").length, 1);
  const callsBeforeDispose = fake.pluginCalls.length;
  await fake.dispose();
  await fake.trigger({ ...fake.getSettings(), codebaseMemoryEnabled: false, ponytailEnabled: false });
  assert.equal(fake.pluginCalls.length, callsBeforeDispose);
});

test("Ponytail embeds all six skills and supports agent-scoped commands", async () => {
  const fake = createContext();
  await applyPonytail(fake.context, { mode: "full", applyToSubagents: true });
  assert.deepEqual(Object.keys(PONYTAIL_SKILLS), [
    "ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help",
  ]);
  assert.equal(fake.skills.length, 6);
  assert.ok(fake.skills.every((skill) => skill.provider === "mtm-coding" && skill.invocation.modelInvocable));
  const agent = { session: { header: { origin: "main" } }, inject(message) { fake.injected.push(message); } };
  const start = onlyListener(fake.listeners, "agent/session-start");
  start({ agent });
  const section = fake.sections.find((item) => item.name === "mtm-coding:ponytail");
  assert.ok(section);
  assert.match(section.text({ agent }), /PONYTAIL MODE ACTIVE - level: full/);
  const modeCommand = fake.commands.find((command) => command.name === "ponytail");
  assert.ok(modeCommand);
  assert.equal(modeCommand.handler({ rawInput: "ultra", agent }).text, "Ponytail mode: ultra");
  assert.match(section.text({ agent }), /PONYTAIL MODE ACTIVE - level: ultra/);
  const skillCommand = fake.commands.find((command) => command.name === "ponytail-review");
  assert.ok(skillCommand);
  assert.equal(skillCommand.handler({ rawInput: "", agent }).text, "Loaded ponytail-review.");
  assert.match(fake.injected.at(-1).content[0].text, /<skill_content name="ponytail-review">/);
  await fake.dispose();
});

test("Ponytail can be excluded from subagent system prompts", async () => {
  const fake = createContext();
  await applyPonytail(fake.context, { mode: "full", applyToSubagents: false });
  const subagent = { session: { header: { origin: "subagent" } }, inject() {} };
  const section = fake.sections[0];
  assert.equal(section.text({ agent: subagent }), "");
});
