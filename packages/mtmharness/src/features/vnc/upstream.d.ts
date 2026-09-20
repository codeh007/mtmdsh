declare module "@kasmtech/novnc/core/rfb.js" {
  export default class RFB extends EventTarget {
    constructor(
      target: HTMLElement,
      input: HTMLTextAreaElement,
      channel: unknown,
      options: { shared: boolean; multiMonitor: boolean },
      codecs: number[],
      primary: boolean,
    );
    mouseButtonMapper: unknown;
    enableWebRTC: boolean;
    enableQOI: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipboardBinary: boolean;
    clipboardSeamless: boolean;
    clipboardUp: boolean;
    clipboardDown: boolean;
    disconnect(): void;
    focus(): void;
    updateConnectionSettings(): void;
  }
}

declare module "@kasmtech/novnc/core/mousebuttonmapper.js" {
  export default class MouseButtonMapper {
    set(button: number, target: number): void;
  }
  export const XVNC_BUTTONS: Record<string, number>;
}
