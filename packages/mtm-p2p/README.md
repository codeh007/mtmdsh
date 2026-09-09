# mtm-p2p

Minimal browser P2P facade for mtmharness. The client exposes getSnapshot, subscribe, connect, dial, close, and request. A SharedWorker can be supplied through worker or workerUrl.

The worker uses libp2p with WebSockets, Noise, and Yamux, and serves /mtm-p2p/1 as a request/response stream. Requests must target a dialable libp2p multiaddress. Identity and peer metadata are persisted best-effort in IndexedDB, but the current persistence stores metadata only; wiring serialized libp2p private keys and the native peerstore is still transport work.

This package intentionally has no published secondary manifest entry: a local build has no honest HTTPS artifact URL or integrity hash. Network integration coverage is not included because it requires a browser/WebSocket libp2p peer fixture.
