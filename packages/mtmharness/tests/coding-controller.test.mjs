import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const base = {
  codebaseMemoryEnabled: true,
  codebaseMemoryAugmentHooks: true,
  modernGoEnabled: true,
  ponytailEnabled: true,
  ponytailMode: "full",
  ponytailSubagents: true,
  rtkMode: "auto",
};

function createScope(rejectedField) {
  let snapshot = {
    status: "ready",
    value: { ...base },
    base: { ...base },
    user: { ponytailMode: "lite" },
    revision: 1,
    writable: true,
    mode: "host",
  };
  const listeners = new Set();
  const publish = () => { for (const listener of listeners) listener(); };
  const scope = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async set(field, value) {
      if (field === rejectedField) throw new Error("settings rejected");
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: value },
        user: { ...snapshot.user, [field]: value },
        revision: snapshot.revision + 1,
      };
      publish();
    },
    async unset(field) {
      const user = { ...snapshot.user };
      delete user[field];
      snapshot = {
        ...snapshot,
        value: { ...snapshot.value, [field]: snapshot.base[field] },
        user,
        revision: snapshot.revision + 1,
      };
      publish();
    },
  };
  return { scope, getSnapshot: () => snapshot };
}

function createSnapshotStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(next) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

function loadClient() {
  const source = readFileSync(new URL("../lib/client.cjs", import.meta.url), "utf8");
  let registration;
  const window = { __ModuleLoader__: { load(next) { registration = next; } } };
  runInNewContext(source, { window });
  assert.ok(registration, "client artifact must register with the DSH loader");

  const external = new Map([
    ["@deepseek-ai/dsh-client-store", { createSnapshotStore }],
    ["@deepseek-ai/dsh-client-ui-primitives", {
      Button: () => null,
      Modal: () => null,
      Pill: () => null,
    }],
    ["react", { useState: (initial) => [initial, () => {}] }],
    ["react/jsx-runtime", { Fragment: Symbol("Fragment"), jsx: () => null, jsxs: () => null }],
  ]);
  return registration.factory((specifier) => {
    const module = external.get(specifier);
    if (module === undefined) throw new Error("unexpected client external: " + specifier);
    return module;
  });
}

function createClientContext(scope) {
  const registrations = [];
  const cleanups = [];
  const context = {
    locale: {
      bind: () => (key) => key,
      register: () => {},
    },
    settingsScope: { bind: () => scope },
    effect(execute) {
      const cleanup = execute();
      if (typeof cleanup === "function") cleanups.push(cleanup);
    },
    slots: {
      inject(_name, register) {
        register();
      },
      register(options) {
        const face = options.inject();
        registrations.push({ options, face });
        return () => {};
      },
    },
  };
  return { context, registrations, cleanups };
}

function nextTurn() {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

test("client artifact settings card retains drafts when one Host write is rejected", async () => {
  const fake = createScope("ponytailSubagents");
  const client = loadClient();
  const mounted = createClientContext(fake.scope);
  client.applyCoding(mounted.context);
  const face = mounted.registrations[0].face;

  face.edit("ponytailMode", "ultra");
  face.edit("ponytailSubagents", "false");
  face.save();
  await nextTurn();

  const state = face.hooks.mtmCodingCard.getSnapshot();
  assert.equal(state.failed, true);
  assert.equal(state.dirty, true);
  assert.equal(state.fields.ponytailMode.text, "ultra");
  assert.equal(state.fields.ponytailSubagents.text, "false");
  assert.equal(fake.getSnapshot().user.ponytailMode, "ultra");
  assert.equal(Object.hasOwn(fake.getSnapshot().user, "ponytailSubagents"), false);

  for (const cleanup of mounted.cleanups.reverse()) await cleanup();
});

test("client artifact settings card clears an overridden field after Host readback", async () => {
  const fake = createScope();
  const client = loadClient();
  const mounted = createClientContext(fake.scope);
  client.applyCoding(mounted.context);
  const face = mounted.registrations[0].face;

  face.resetField("ponytailMode");
  face.save();
  await nextTurn();

  const state = face.hooks.mtmCodingCard.getSnapshot();
  assert.equal(state.failed, false);
  assert.equal(state.dirty, false);
  assert.equal(state.fields.ponytailMode.text, "full");
  assert.equal(state.fields.ponytailMode.overridden, false);
  assert.equal(Object.hasOwn(fake.getSnapshot().user, "ponytailMode"), false);

  for (const cleanup of mounted.cleanups.reverse()) await cleanup();
});
