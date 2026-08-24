import type { ClientContext } from "@deepseek-ai/dsh-client-runtime/client";
import type { SnapshotSelectorHook } from "@deepseek-ai/dsh-client-ui-slots";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { CanvasViewActions, CanvasViewState } from "./runtime.ts";
import { CanvasView } from "./CanvasView.tsx";
import { CanvasFixtureRuntime } from "./runtime.ts";
import { MTM_CANVAS_CSS } from "./styles.ts";

export type { CanvasViewActions, CanvasViewState } from "./runtime.ts";


declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface SessionStandardProps {
    useCanvas: SnapshotSelectorHook<CanvasViewState>;
    canvasActions: CanvasViewActions;
  }
}

export type MtmCanvasViewProps = ConvViewProps;

export const inject = ["slots", "sessions"];

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.sessions.provide({
    hooks: ["canvas"],
    props: ["canvasActions"],
    resolve: (binding) => {
      const runtime = new CanvasFixtureRuntime();
      const actions: CanvasViewActions = {
        addPrompt: () => runtime.addPrompt(),
        moveNode: (nodeId, position) => runtime.moveNode(nodeId, position),
        generate: (prompt, sourceNodeId) => runtime.generate(prompt, sourceNodeId),
        cancel: () => runtime.cancel(),
      };
      binding.ctx.effect(() => () => runtime.dispose(), "mtmcanvas: session runtime");
      return { hooks: { canvas: runtime }, props: { canvasActions: actions } };
    },
  }), "mtmcanvas: session standard kit");

  ctx.effect(() => {
    if (typeof document === "undefined") return () => {};
    const style = document.createElement("style");
    style.dataset.mtmcanvas = "true";
    style.textContent = MTM_CANVAS_CSS;
    document.head.append(style);
    return () => { style.remove(); };
  }, "mtmcanvas: styles");

  ctx.slots.inject("conversation.view", () => ctx.slots.register({
    name: "conversation.view",
    id: "mtmcanvas",
    order: 20,
    label: "Canvas",
  }, CanvasView));
}
