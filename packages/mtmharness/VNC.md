# Remote desktop

The P2P node view confirms each desktop service directly with that peer before offering **Open desktop**. The link identifies the peer, a browser WebSocket multiaddr and the `desktop` instance. It contains no credential. Opening or restoring a view rechecks the target; a stopped desktop requires **Start desktop**. Closing the view disconnects only its stream. **Stop shared desktop** also affects other viewers.

This internal-test profile permits anonymous desktop control, as authorized in [gomtm #1123](https://github.com/codeh007/gomtm/issues/1123#issuecomment-5743007030). Future user/resource authorization belongs at gomtm's `/api/vnc` mount, covering discovery, lifecycle and data connections. Peer identity is not user authorization. The client never forwards its existing OAuth token to a discovered peer.

Serve `lib/p2p-worker.js`, `lib/vnc-client.js` and `lib/assets/` from the same package build. Configure `p2p.workerUrl`; the lazy RFB module is its `vnc-client.js` sibling. The client module URL comes from host configuration, never from the remote node. The RFB module is loaded only when a confirmed ready desktop is opened. The node list does not install or start desktops.

Supported scope: one desktop view, mouse/keyboard, server-provided resolution, fit-to-view and actual pixels. Clipboard, audio, QOI, WebRTC and multiple monitors are disabled. No NAT/relay topology is implied: only browser-dialable `ws`/`wss` peer addresses accepted by the P2P worker are supported. A suspended or crashed view loses its stream after a two-minute heartbeat lease; reconnect explicitly rechecks service generation. Binary buffering is limited to 8 MiB per direction and a slow consumer is disconnected.

## Upstream sources and license

The RFB implementation is KasmVNC **v1.5.0**'s official `kasmweb` gitlink: [kasmtech/noVNC at 475ecfa5356579ef222983c7ce4619a7576a3bce](https://github.com/kasmtech/noVNC/tree/475ecfa5356579ef222983c7ce4619a7576a3bce). Its manifest says 1.3.0; that is not the server compatibility version. The exact source archive and integrity are locked by pnpm. No historical gomtm vendor or encoder-handshake shim is restored.

Core is MPL-2.0, with the original AUTHORS and license notices distributed beside the built module. Pako is MIT; DES contains BSD notices. Source modifications are published in [the client patch](https://github.com/codeh007/mtmdsh/blob/main/patches/@kasmtech__novnc@1.3.0.patch): detach Kasm's full-page UI bookkeeping from the renderer, disable multi-monitor registration for this view, support its keyboard input inside a shadow root, and release listeners/channels at disconnect. RFB codecs and encoder negotiation remain upstream implementations. Build the corresponding source plus this patch with this repository's lockfile to reproduce the module.

The existing `@libp2p/http` implements HTTP upgrade and WebSocket framing over `/http/1.1`. Its pinned [WebSocket lifecycle patch](https://github.com/codeh007/mtmdsh/blob/main/patches/@libp2p__http-websocket@2.0.4.patch) fixes caller cancellation, close-frame transmission, stream disposal and event-handler replacement. It releases the stream after flushing close, without waiting for a peer acknowledgement; upstream close code/reason metadata is not exposed by this profile. The browser bridge copies reusable RFB buffers and owns its MessagePort, abort signal and bounded queues.

Real framebuffer/input/reconnect evidence must be recorded in #1123 before this migration is considered complete. A successful build or a direct Kasm connection alone does not establish P2P acceptance.
