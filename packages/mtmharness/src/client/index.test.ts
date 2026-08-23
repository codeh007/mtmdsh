import { describe, expect, it } from "vitest";
import { apply as applyHost } from "../index.ts";
import { apply, inject } from "./index.ts";

type Registered = {
  name: string;
  options: Record<string, unknown>;
  component: unknown;
};

function bench(): { registered: Registered[]; dispose: () => void } {
  const registered: Registered[] = [];
  let disposeInjection = (): void => {};
  const ctx = {
    slots: {
      inject(name: string, callback: () => () => void) {
        if (name !== "sidebar.footer.action") throw new Error("unexpected slot: " + name);
        const remove = callback();
        disposeInjection = remove;
        return remove;
      },
      register(options: Record<string, unknown>, component: unknown) {
        const entry = { name: String(options.name), options, component };
        registered.push(entry);
        return () => {
          const index = registered.indexOf(entry);
          if (index >= 0) registered.splice(index, 1);
        };
      },
    },
  };
  apply(ctx as never);
  return { registered, dispose: () => { disposeInjection(); } };
}

describe("mtmharness Host half", () => {
  it("contributes an inert loader plugin", () => {
    expect(applyHost).not.toThrow();
  });
});

describe("mtmharness browser half", () => {
  it("declares the slot dependency", () => {
    expect(inject).toEqual(["slots"]);
  });

  it("injects one sidebar action with a disposer-owned registration", () => {
    const { registered, dispose } = bench();
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      name: "sidebar.footer.action",
      options: { id: "mtmharness", order: 10 },
    });
    dispose();
    expect(registered).toHaveLength(0);
  });
});
