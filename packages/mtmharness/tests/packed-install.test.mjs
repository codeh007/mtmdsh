import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const packageRoot = resolve(import.meta.dirname, "..");

function createContext() {
  const root = makeFiber();
  let currentFiber = root;
  let settings = {};
  const providers = [];
  const sections = [];

  function makeFiber() {
    return {
      children: [],
      disposers: [],
      disposed: false,
      async dispose() {
        if (this.disposed) return;
        this.disposed = true;
        for (const child of [...this.children].reverse()) await child.dispose();
        for (const disposer of [...this.disposers].reverse()) await disposer();
      },
    };
  }

  const context = {
    settings: {
      register(_namespace, _schema, options = {}) {
        settings = { ...settings, ...(options.base ?? {}) };
        return {
          get: () => settings,
          watch() { return () => {}; },
        };
      },
    },
    skills: {
      registerProvider(create) {
        const controller = new AbortController();
        const provider = create({ signal: controller.signal, invalidate() {} });
        providers.push(provider);
        const dispose = async () => {
          controller.abort();
          const index = providers.indexOf(provider);
          if (index >= 0) providers.splice(index, 1);
          await provider.dispose?.();
        };
        currentFiber.disposers.push(dispose);
        return dispose;
      },
      async list(options = {}) {
        const candidates = [];
        for (const provider of providers) {
          const listed = await provider.list(options);
          candidates.push(...(Array.isArray(listed) ? listed : listed.candidates));
        }
        return candidates;
      },
      async get(name, options = {}) {
        for (const provider of providers) {
          const listed = await provider.list(options);
          const candidates = Array.isArray(listed) ? listed : listed.candidates;
          const candidate = candidates.find((item) => item.name === name);
          if (candidate !== undefined) return provider.get(candidate, options);
        }
        return undefined;
      },
    },
    systemPrompt: {
      section(section) {
        sections.push(section);
        const dispose = () => {
          const index = sections.indexOf(section);
          if (index >= 0) sections.splice(index, 1);
        };
        currentFiber.disposers.push(dispose);
        return dispose;
      },
    },
    plugin: async (plugin, config) => {
      const fiber = makeFiber();
      currentFiber.children.push(fiber);
      const previous = currentFiber;
      currentFiber = fiber;
      try {
        await plugin.apply(context, config);
      } finally {
        currentFiber = previous;
      }
      return fiber;
    },
    effect(execute) {
      const output = execute();
      if (typeof output === "function") currentFiber.disposers.push(output);
      else if (output !== null && typeof output === "object" && typeof output.next === "function") {
        let step = output.next();
        while (!step.done) {
          if (typeof step.value === "function") currentFiber.disposers.push(step.value);
          step = output.next();
        }
      }
      return output;
    },
    on(_event, _listener) { return () => {}; },
    get() { return undefined; },
    logger: { debug() {}, warn() {}, error() {} },
  };

  return {
    context,
    providers,
    sections,
    async dispose() { await root.dispose(); },
  };
}

test("packed mtmharness discovers skills from its editable DSH home", async () => {
  const tempRoot = mkdtempSync(join(packageRoot, ".tmp-packed-install-"));
  const previousDshHome = process.env.DSH_HOME;
  try {
    const packRoot = join(tempRoot, "pack");
    const installRoot = join(tempRoot, "install");
    const dshHome = join(tempRoot, "dsh-home");
    mkdirSync(packRoot);
    mkdirSync(installRoot);
    const skillPath = join(dshHome, "mtmharness", "skills", "modern-go", "use-modern-go", "SKILL.md");
    const skillDirectory = join(skillPath, "..");
    mkdirSync(join(skillDirectory, "scripts"), { recursive: true });
    writeFileSync(skillPath, "---\nname: use-modern-go\ndescription: Modern Go guidance.\n---\n\ngo run github.com/JetBrains/go-modern-guidelines@v0.1.1 list --file-path\n");
    for (const name of ["VERSION", "run-tool.ps1", "run-tool.sh"]) writeFileSync(join(skillDirectory, "scripts", name), "pinned resource fixture\n");
    process.env.DSH_HOME = dshHome;

    execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", packRoot], { cwd: packageRoot, stdio: "pipe" });
    const archiveName = readdirSync(packRoot).find((name) => name.endsWith(".tgz"));
    assert.ok(archiveName);
    const archive = join(packRoot, archiveName);
    const archiveFiles = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" });
    assert.doesNotMatch(archiveFiles, /package\/src\/skills\/|ponytail-skills|rtk-skill|features\/coding\/modern-go/);

    writeFileSync(join(installRoot, "package.json"), JSON.stringify({ private: true, type: "module" }));
    execFileSync("npm", ["install", "--ignore-scripts", "--no-package-lock", "--no-save", "--legacy-peer-deps", archive], {
      cwd: installRoot,
      stdio: "pipe",
    });

    const installedPackage = resolve(installRoot, "node_modules", "mtmharness");
    const installed = await import(pathToFileURL(join(installedPackage, "lib/index.js")).href);
    const modernGo = installed.MTM_CODING_PACKAGES.packages.find((item) => item.id === "modern-go");
    assert.ok(modernGo);
    assert.deepEqual(modernGo.skills.files.map((file) => file.path), [
      "plugin/skills/use-modern-go/SKILL.md",
      "plugin/skills/use-modern-go/scripts/VERSION",
      "plugin/skills/use-modern-go/scripts/run-tool.ps1",
      "plugin/skills/use-modern-go/scripts/run-tool.sh",
    ]);

    const fake = createContext();
    await installed.applyCoding(fake.context, {
      codebaseMemoryEnabled: false,
      ponytailEnabled: false,
      rtkMode: "off",
    });
    const skills = await fake.context.skills.list();
    assert.deepEqual(skills.map((skill) => skill.name), ["use-modern-go"]);
    const skill = await fake.context.skills.get("use-modern-go");
    assert.ok(skill);
    assert.equal(skill.source, "custom");
    assert.equal(skill.path, skillPath);
    assert.match(skill.content, /go-modern-guidelines@v0\.1\.1/);
    await fake.dispose();
    assert.equal(fake.providers.length, 0);
  } finally {
    if (previousDshHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = previousDshHome;
    rmSync(tempRoot, { recursive: true, force: true });
  }
});
