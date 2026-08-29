import type { ReactElement } from "react";
import type { ConnectActions, ConnectViewState, MockConnection } from "./runtime.ts";

function statusLabel(status: MockConnection["status"]): string {
  return status === "online" ? "Online" : "Offline";
}

function Status({ status }: { status: MockConnection["status"] }): ReactElement {
  return <span className={"mtm-connect-status mtm-connect-status-" + status}>{statusLabel(status)}</span>;
}

function selectedConnection(state: ConnectViewState): MockConnection | undefined {
  return state.connections.find((connection) => connection.id === state.selectedId) ?? state.connections[0];
}

export function ConnectView({ state, actions, onClose }: { state: ConnectViewState; actions: ConnectActions; onClose: () => void }): ReactElement {
  const selected = selectedConnection(state);
  const online = state.connections.filter((connection) => connection.status === "online").length;
  return (
    <main className="mtm-connect-view" aria-label="MTM Connect">
      <header className="mtm-connect-header">
        <div>
          <span className="mtm-connect-kicker">MTM Connect</span>
          <h1>Device connections</h1>
          <p>Mock backend</p>
        </div>
        <button type="button" className="mtm-connect-close" onClick={onClose} aria-label="Close MTM Connect">Close</button>
      </header>
      <section className="mtm-connect-summary" aria-label="Connection summary">
        <div><strong>{state.connections.length}</strong><span>Connections</span></div>
        <div><strong>{online}</strong><span>Online</span></div>
        <div><strong>{state.connections.reduce((total, connection) => total + connection.capabilities.length, 0)}</strong><span>Capabilities</span></div>
      </section>
      <div className="mtm-connect-body">
        <section className="mtm-connect-list" aria-labelledby="mtm-connect-connections-heading">
          <div className="mtm-connect-toolbar">
            <h2 id="mtm-connect-connections-heading">Connections</h2>
            <button type="button" onClick={actions.refresh} disabled={state.loading}>Refresh</button>
          </div>
          <div className="mtm-connect-list-items">
            {state.connections.map((connection) => (
              <button
                key={connection.id}
                type="button"
                aria-pressed={connection.id === selected?.id}
                data-mtm-connect-focus={connection.id === state.connections[0]?.id ? "true" : undefined}
                onClick={() => { actions.select(connection.id); }}
              >
                <span className="mtm-connect-list-copy"><strong>{connection.label}</strong><small>{connection.target}</small></span>
                <Status status={connection.status} />
              </button>
            ))}
          </div>
        </section>
        <section className="mtm-connect-detail" aria-labelledby="mtm-connect-detail-heading">
          {selected === undefined ? <p className="mtm-connect-empty">No connections.</p> : (
            <>
              <div className="mtm-connect-detail-heading">
                <div>
                  <h2 id="mtm-connect-detail-heading">{selected.label}</h2>
                  <p>{selected.target}</p>
                </div>
                <Status status={selected.status} />
              </div>
              <dl className="mtm-connect-meta">
                <div><dt>Generation</dt><dd>{selected.generation}</dd></div>
                <div><dt>Latency</dt><dd>{selected.latencyMs === 0 ? "-" : selected.latencyMs + " ms"}</dd></div>
                <div><dt>Last seen</dt><dd>{new Date(selected.lastSeen).toLocaleTimeString()}</dd></div>
              </dl>
              <h2>Capabilities</h2>
              <ul className="mtm-connect-capabilities">
                {selected.capabilities.map((capability) => <li key={capability}>{capability}</li>)}
              </ul>
              <button type="button" className="mtm-connect-action" onClick={() => { actions.toggle(selected.id); }}>
                {selected.status === "online" ? "Disconnect" : "Connect"}
              </button>
            </>
          )}
        </section>
      </div>
      {state.notice !== undefined ? <div className="mtm-connect-notice" role="status">{state.notice}</div> : null}
      {state.error !== undefined ? <div className="mtm-connect-error" role="alert">{state.error}</div> : null}
    </main>
  );
}
