import MouseButtonMapper, {
  XVNC_BUTTONS,
} from "@kasmtech/novnc/core/mousebuttonmapper.js";
import RFB from "@kasmtech/novnc/core/rfb.js";

// Built as its own module: opening the node list never downloads the RFB client.
export function createRfb(
  target: HTMLElement,
  input: HTMLTextAreaElement,
  channel: unknown,
): RFB {
  const rfb = new RFB(
    target,
    input,
    channel,
    { shared: true, multiMonitor: false },
    [],
    true,
  );
  const mapper = new MouseButtonMapper();
  for (const [button, name] of [
    "LEFT_BUTTON",
    "MIDDLE_BUTTON",
    "RIGHT_BUTTON",
    "BACK_BUTTON",
    "FORWARD_BUTTON",
  ].entries()) {
    mapper.set(button, XVNC_BUTTONS[name]);
  }
  rfb.mouseButtonMapper = mapper;
  rfb.enableWebRTC = false;
  rfb.enableQOI = false;
  rfb.scaleViewport = true;
  rfb.resizeSession = false;
  rfb.clipboardBinary = false;
  rfb.clipboardSeamless = false;
  rfb.clipboardUp = false;
  rfb.clipboardDown = false;
  rfb.addEventListener("connect", () => {
    const canvas = target.querySelector("canvas");
    if (canvas) {
      canvas.tabIndex = 0;
      canvas.setAttribute(
        "aria-label",
        "Remote desktop; keyboard and mouse control the selected node",
      );
    }
  });
  return rfb;
}
