import type { PropsRuntime, InjectFace } from "@deepseek-ai/dsh-client-ui-slots";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import { CanvasView } from "../features/canvas/client/CanvasView.tsx";
import type { CanvasRuntime, CanvasViewState } from "../features/canvas/client/runtime.ts";
import { useState, type ReactElement } from "react";

type MtmCanvasActionInjected = {
  readonly actions: CanvasRuntime;
  readonly hooks: { readonly canvas: CanvasRuntime };
};

export type MtmCanvasActionProps = PropsRuntime<"sidebar.footer.action"> & InjectFace<MtmCanvasActionInjected>;

/** Open the file-backed Canvas editor from the DSH Web sidebar. */
export function MtmCanvasAction({ wide, actions, useCanvas }: MtmCanvasActionProps): ReactElement {
  const [open, setOpen] = useState(false);
  const state = useCanvas((snapshot): CanvasViewState => snapshot);
  const label = "Open Canvas";
  return (
    <>
      <Button
        className={wide ? "mtm-trigger mtm-trigger-wide" : "mtm-trigger mtm-trigger-rail"}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={label}
        variant="ghost"
        size={wide ? "md" : "sm"}
        onClick={() => { setOpen(true); }}
      >
        Canvas
      </Button>
      <Modal
        open={open}
        onClose={() => { setOpen(false); }}
        title="Canvas"
        closeLabel="Close Canvas"
        className="mtm-modal"
        contentClassName="mtm-modal-content"
      >
        <CanvasView state={state} actions={actions} />
      </Modal>
    </>
  );
}
