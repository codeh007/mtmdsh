import { useState } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { Button, IconCodeOutline16, Modal } from "@deepseek-ai/dsh-client-ui-primitives";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";

export type MtmHarnessActionProps = PropsRuntime<"sidebar.footer.action">;

export function MtmHarnessAction({ wide }: MtmHarnessActionProps) {
  const [open, setOpen] = useState(false);
  const label = "Open MTM Harness";

  return (
    <>
      <Button
        aria-label={label}
        title={label}
        variant="ghost"
        size={wide ? "md" : "sm"}
        icon={<IconCodeOutline16 size={wide ? 16 : 18} />}
        onClick={() => { setOpen(true); }}
      >
        {wide ? "MTM Harness" : null}
      </Button>
      <Modal
        open={open}
        onClose={() => { setOpen(false); }}
        title="MTM Harness"
        closeLabel="Close MTM Harness panel"
        description="The MTM Harness plugin is active in this DSH Web host."
        footer={<Button variant="primary" onClick={() => { setOpen(false); }}>Close</Button>}
      >
        <dl>
          <div><dt>Plugin</dt><dd>mtmharness</dd></div>
          <div><dt>Transport</dt><dd>Provided by DSH Host</dd></div>
        </dl>
      </Modal>
    </>
  );
}
