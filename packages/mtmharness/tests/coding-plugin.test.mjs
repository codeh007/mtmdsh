import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applyCoding,
  applyCodebaseMemory,
  applyPonytail,
  applyRtk,
  resolveConfig,
  MTM_CODING_PACKAGES,
  name,
} from "../lib/index.js";

const DEFAULT_SETTINGS = {
  codebaseMemoryEnabled: true,
  codebaseMemoryAugmentHooks: true,
  ponytailEnabled: true,
  ponytailMode: "full",
  ponytailSubagents: true,
  rtkMode: "auto",
  serverName: "codebase_memory",
  command: "/controlled/codebase-memory-mcp",
  args: [],
  cwd: "",
  env: {},
  cacheDir: "",
  allowedRoot: "",
  toolCallTimeoutMs: 60_000,
  hookTimeoutMs: 2_000,
  failOnStartupError: false,
  reconnect: { enabled: true, initialDelayMs: 500, maxDelayMs: 30_000, maxAttempts: 10 },
};

const previousDshHome = process.env.DSH_HOME;
const testDshHome = mkdtempSync(join(tmpdir(), "mtmharness-coding-skills-"));
process.env.DSH_HOME = testDshHome;
const managedSkillsRoot = join(testDshHome, "mtmharness", "skills");

function writeSkill(root, name, description, body) {
  const directory = join(root, name);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "SKILL.md"), "---\nname: " + name + "\ndescription: " + description + "\n---\n\n" + body + "\n");
}

function manifestSkillNames() {
  return MTM_CODING_PACKAGES.packages.flatMap((packageManifest) =>
    packageManifest.skills?.files.map((file) => file.name) ?? []);
}

writeSkill(join(managedSkillsRoot, "modern-go"), "use-modern-go", "Modern Go test guidance.", "Run go run github.com/JetBrains/go-modern-guidelines@v0.1.1 list --file-path.");
const modernGoScripts = join(managedSkillsRoot, "modern-go", "use-modern-go", "scripts");
mkdirSync(modernGoScripts, { recursive: true });
for (const name of ["VERSION", "run-tool.ps1", "run-tool.sh"]) writeFileSync(join(modernGoScripts, name), "pinned resource fixture\n");
for (const name of ["ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help"]) {
  writeSkill(join(managedSkillsRoot, "ponytail"), name, "Ponytail test guidance.", "Ponytail skill body.");
}

test.after(() => {
  if (previousDshHome === undefined) delete process.env.DSH_HOME;
  else process.env.DSH_HOME = previousDshHome;
  rmSync(testDshHome, { recursive: true, force: true });
});

function createContext(settingsValue = {}) {
  const listeners = new Map();
  const sections = [];
  const injected = [];
  const spawnSpecs = [];
  const pluginCalls = [];
  const commands = [];
  const skills = [];
  const skillProviders = [];
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
          const result = await plugin.apply(context, config);
          if (result !== undefined && typeof result !== "function") throw new TypeError("Invalid effect");
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
      registerProvider(create) {
        const lifecycle = new AbortController();
        const provider = create({ signal: lifecycle.signal, invalidate() {} });
        skillProviders.push(provider);
        const disposeProvider = async () => {
          lifecycle.abort();
          const index = skillProviders.indexOf(provider);
          if (index >= 0) skillProviders.splice(index, 1);
          await provider.dispose?.();
        };
        currentFiber.effects.push(disposeProvider);
        return disposeProvider;
      },
      async list(options = {}) {
        const candidates = [];
        for (const provider of skillProviders) {
          const listed = await provider.list(options);
          candidates.push(...(Array.isArray(listed) ? listed : listed.candidates));
        }
        return candidates;
      },
      async get(name, options = {}) {
        for (const provider of skillProviders) {
          const listed = await provider.list(options);
          const candidates = Array.isArray(listed) ? listed : listed.candidates;
          const candidate = candidates.find((item) => item.name === name);
          if (candidate !== undefined) return provider.get(candidate, options);
        }
        return skills.find((skill) => skill.name === name);
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
    get() { return undefined; },
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
    skillProviders,
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

test("Codebase Memory rejects reconnect values outside the DSH contract", () => {
  assert.throws(() => resolveConfig({ reconnect: { initialDelayMs: 0 } }), /initialDelayMs/);
  assert.throws(() => resolveConfig({ reconnect: { maxDelayMs: 1.5 } }), /maxDelayMs/);
  assert.throws(() => resolveConfig({ reconnect: { maxAttempts: 0 } }), /maxAttempts/);
  assert.throws(() => resolveConfig({ reconnect: { initialDelayMs: 2_000, maxDelayMs: 1_000 } }), /less than or equal/);
});

test("Codebase Memory does not preflight its lazy npx command", async () => {
  const fake = createContext({
    codebaseMemoryEnabled: true,
    command: "",
    ponytailEnabled: false,
    rtkMode: "off",
  });
  await applyCoding(fake.context, {});
  const mcp = fake.pluginCalls.find((call) => call.config?.transport === "stdio");
  assert.ok(mcp);
  assert.equal(mcp.config.command, process.execPath);
  assert.match(mcp.config.args[0], /npm[/\\]bin[/\\]npx-cli\.js$/);
  assert.deepEqual(mcp.config.args.slice(1, 5), ["--yes", "--package", "codebase-memory-mcp@0.10.8", "codebase-memory-mcp"]);
  assert.equal(fake.spawnSpecs.length, 0);
  await fake.dispose();
});

test("Codebase Memory hooks become bounded DSH context messages", async () => {
  const fake = createContext();
  await applyCodebaseMemory(fake.context, {
    command: "/controlled/codebase-memory-mcp",
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

test("unified settings reconcile coding features and unregister the watcher", async () => {
  const fake = createContext({ codebaseMemoryEnabled: false, ponytailMode: "lite" });
  await applyCoding(fake.context, {});
  assert.equal(name, "mtmharness");
  const listedSkills = await fake.context.skills.list({});
  assert.equal(listedSkills.length, 7);
  assert.equal(MTM_CODING_PACKAGES.packages.filter((item) => item.kind === "data-only").length, 1);
  assert.equal(fake.skillProviders.length, 2);
  const modernGo = await fake.context.skills.get("use-modern-go");
  assert.ok(modernGo);
  assert.equal(modernGo.invocation.modelInvocable, true);
  assert.equal(modernGo.invocation.userInvocable, true);
  assert.equal(modernGo.provider, "mtm-coding-modern-go");
  assert.equal(modernGo.source, "custom");
  assert.equal(modernGo.resourceBase.kind, "directory");
  assert.match(modernGo.resourceBase.path, /mtmharness[/\\]skills[/\\]modern-go[/\\]use-modern-go$/);
  assert.match(modernGo.path, /mtmharness[/\\]skills[/\\]modern-go[/\\]use-modern-go[/\\]SKILL\.md$/);
  assert.match(modernGo.content, /go run github\.com\/JetBrains\/go-modern-guidelines@v0\.1\.1/);
  assert.match(modernGo.content, /list --file-path/);
  assert.equal(fake.spawnSpecs.length, 0);
  const autoSection = fake.sections.find((section) => section.name === "mtm-coding:rtk:status");
  assert.ok(autoSection);
  assert.match(autoSection.text({}), /guidance is active/);
  assert.equal(fake.sections.find((section) => section.name === "mtm-coding:rtk:prompt")?.text, "RTK only concerns Bash shell commands. DSH read, grep, glob, PowerShell, and persistent terminal calls are not covered by this integration.\nRTK failures and unsupported commands pass through; RTK_DISABLED=1 disables one command.");
  assert.equal(fake.listeners.has("tools/pre-record-input"), false);
  assert.equal(fake.pluginCalls.filter((call) => call.config?.transport === "stdio").length, 0);
  await fake.trigger({ ...fake.getSettings(), codebaseMemoryEnabled: true });
  assert.equal(fake.pluginCalls.filter((call) => call.config?.transport === "stdio").length, 1);
  await fake.trigger({ ...fake.getSettings(), rtkMode: "off" });
  assert.equal(fake.skillProviders.length, 2);
  assert.equal(fake.sections.some((section) => section.name === "mtm-coding:rtk:prompt"), false);
  assert.equal((await fake.context.skills.list({})).some((skill) => skill.name === "rtk"), false);
  await fake.trigger({ ...fake.getSettings(), rtkMode: "guidance" });
  assert.equal(fake.skillProviders.length, 2);
  assert.equal(fake.sections.some((section) => section.name === "mtm-coding:rtk:prompt"), true);
  const callsBeforeDispose = fake.pluginCalls.length;
  await fake.dispose();
  assert.equal(fake.skillProviders.length, 0);
  await fake.trigger({ ...fake.getSettings(), codebaseMemoryEnabled: false, ponytailEnabled: false });
  assert.equal(fake.pluginCalls.length, callsBeforeDispose);
});

test("coding features do not duplicate manifest skills as commands", async () => {
  const fake = createContext();
  await applyCoding(fake.context, {});
  const commandNames = new Set(fake.commands.map((command) => command.name));
  const skillCommandNames = manifestSkillNames().filter((name) => commandNames.has(name));
  assert.deepEqual(skillCommandNames, ["ponytail"]);
  await fake.dispose();
  assert.equal(fake.skillProviders.length, 0);
});

test("data-only manifest packages mount without package-specific feature code", async () => {
  const enabled = createContext();
  await applyCoding(enabled.context, {});
  const skill = await enabled.context.skills.get("use-modern-go");
  assert.ok(skill);
  assert.equal(skill.source, "custom");
  assert.equal(skill.resourceBase.kind, "directory");
  assert.match(skill.path, /mtmharness[/\\]skills[/\\]modern-go[/\\]use-modern-go[/\\]SKILL\.md$/);
  assert.match(skill.content, /go run github\.com\/JetBrains\/go-modern-guidelines@v0\.1\.1 list --file-path/);
  assert.equal(enabled.spawnSpecs.length, 0);
  await enabled.dispose();
  assert.equal(enabled.skillProviders.length, 0);
});

test("RTK does not register an unsupported DSH input hook", async () => {
  const fake = createContext();
  fake.context.get = (key) => key === "tools"
    ? { resolveRecordInput() {}, get() { return {}; } }
    : key === "subprocess" ? {} : undefined;
  await applyRtk(fake.context, { mode: "rewrite" });
  assert.equal(fake.listeners.has("tools/pre-record-input"), false);
  assert.equal(await fake.context.skills.get("rtk"), undefined);
  const section = fake.sections.find((item) => item.name === "mtm-coding:rtk:status");
  assert.ok(section);
  assert.match(section.text({}), /unavailable/);
  const manifestPrompt = fake.sections.find((item) => item.name === "mtm-coding:rtk:prompt");
  assert.ok(manifestPrompt);
  assert.match(manifestPrompt.text, /Bash/);
  const agent = { session: { header: {} }, inject(message) { fake.injected.push(message); } };
  onlyListener(fake.listeners, "agent/session-start")({ agent });
  assert.match(fake.injected[0].content[0].text, /unavailable/);
  const command = fake.commands.find((item) => item.name === "rtk");
  assert.equal((await command.handler({ rawInput: "", agent })).text.includes("unavailable"), true);
  assert.equal((await command.handler({ rawInput: "skill", agent })).kind, "error");
  await fake.dispose();
  assert.equal(fake.skillProviders.length, 0);
});

test("Ponytail exposes skills without duplicating companion commands", async () => {
  const fake = createContext();
  await applyPonytail(fake.context, { mode: "full", applyToSubagents: true });
  const ponytailSkills = await fake.context.skills.list({});
  assert.deepEqual(ponytailSkills.map((skill) => skill.name).sort(), [
    "ponytail", "ponytail-audit", "ponytail-debt", "ponytail-gain", "ponytail-help", "ponytail-review",
  ]);
  assert.equal(ponytailSkills.length, 6);
  assert.ok(ponytailSkills.every((skill) => skill.provider === "mtm-coding-ponytail" && skill.source === "custom" && skill.invocation.modelInvocable && skill.invocation.userInvocable));
  const reviewSkill = await fake.context.skills.get("ponytail-review");
  assert.ok(reviewSkill);
  assert.match(reviewSkill.content, /Ponytail skill body/);
  assert.deepEqual(fake.commands.map((command) => command.name), ["ponytail"]);
  const agent = { session: { header: { origin: "main" } } };
  const start = onlyListener(fake.listeners, "agent/session-start");
  start({ agent });
  const section = fake.sections.find((item) => item.name === "mtm-coding:ponytail");
  assert.ok(section);
  assert.match(section.text({ agent }), /PONYTAIL MODE ACTIVE - level: full/);
  const modeCommand = fake.commands.find((command) => command.name === "ponytail");
  assert.ok(modeCommand);
  assert.equal(modeCommand.handler({ rawInput: "off", agent }).text, "Ponytail mode: off");
  assert.equal(modeCommand.handler({ rawInput: "", agent }).text, "Ponytail mode: full");
  assert.match(section.text({ agent }), /PONYTAIL MODE ACTIVE - level: full/);
  assert.equal(modeCommand.handler({ rawInput: "ultra", agent }).text, "Ponytail mode: ultra");
  assert.match(section.text({ agent }), /PONYTAIL MODE ACTIVE - level: ultra/);
  await fake.dispose();
  assert.equal(fake.skillProviders.length, 0);
});

test("Ponytail respects model invocation and clears stale skills", async () => {
  const fake = createContext();
  let coreSkill = {
    name: "ponytail",
    description: "Ponytail rules.",
    invocation: { modelInvocable: true, userInvocable: true },
    provider: "test",
    source: "custom",
    content: "Ponytail skill body.",
  };
  fake.context.skills.get = async (name) => name === "ponytail" ? coreSkill : undefined;
  await applyPonytail(fake.context, { mode: "full" });
  const section = fake.sections[0];
  assert.match(section.text({}), /Ponytail skill body/);

  coreSkill = { ...coreSkill, invocation: { modelInvocable: false, userInvocable: true } };
  await onlyListener(fake.listeners, "skills/change")();
  assert.equal(section.text({}), "");

  coreSkill = undefined;
  await onlyListener(fake.listeners, "skills/change")();
  assert.equal(section.text({}), "");
  await fake.dispose();
});

test("Ponytail can be excluded from subagent system prompts", async () => {
  const fake = createContext();
  await applyPonytail(fake.context, { mode: "full", applyToSubagents: false });
  const subagent = { session: { header: { origin: "subagent" } }, inject() {} };
  const section = fake.sections[0];
  assert.equal(section.text({ agent: subagent }), "");
  await fake.dispose();
  assert.equal(fake.skillProviders.length, 0);
});
