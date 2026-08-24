import { useState, type ReactElement } from "react";
import type { PropsRuntime, InjectFace } from "@deepseek-ai/dsh-client-ui-slots";
import { Button, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { MtmConnectPanel, type MtmConnectPanelActions } from "../features/connect/client/MtmConnectPanel.tsx";
import type { MtmConnectClientRuntime, MtmConnectViewState } from "../features/connect/client/runtime.ts";

export interface MtmHarnessActionInjected {
  readonly actions: MtmConnectPanelActions;
  readonly hooks: {
    readonly connect: MtmConnectClientRuntime;
  };
}

export type MtmHarnessActionProps = PropsRuntime<"sidebar.footer.action"> & InjectFace<MtmHarnessActionInjected>;

export function MtmHarnessAction({ wide, actions, useConnect }: MtmHarnessActionProps): ReactElement {
  const [open, setOpen] = useState(false);
  const state = useConnect((snapshot): MtmConnectViewState => snapshot);
  const label = "打开 MTM";

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
        MTM
      </Button>
      <Modal
        open={open}
        onClose={() => { setOpen(false); }}
        title="MTM"
        closeLabel="关闭 MTM"
        className="mtm-modal"
        contentClassName="mtm-modal-content"
      >
        <MtmConnectPanel state={state} actions={actions} />
      </Modal>
    </>
  );
}
