# mtm-p2p

Minimal browser P2P facade composed by mtmharness.

The package exports MtmP2pClient and a Cordis apply(ctx, config) entry. The status overlay is registered in the host shell overlay slot and its client is closed by the owning Cordis fiber. It never appends UI directly to document.body.

The worker uses libp2p with WebSockets, Noise, and Yamux.
