import { useState, useSyncExternalStore, type ReactElement } from "react";
import type { PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import { Button, IconCodeOutline16, Modal, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import type {} from "@deepseek-ai/dsh-client-ui-sidebar/client";
import { EVENT_POLICIES, type EventPolicy } from "../contract/event.ts";
import type { CapabilityBinding, ConnectionRecord } from "../contract/connection.ts";
import type { AdapterDescriptor } from "../contract/adapter.ts";
import type { MtmConnectClientRuntime, MtmConnectViewState } from "./runtime.ts";

export type MtmConnectActionProps = PropsRuntime<"sidebar.footer.action"> & {
  readonly runtime: MtmConnectClientRuntime;
};

const STATUS_LABELS: Record<string, string> = {
  configured: "Configured",
  authorizing: "Authorizing",
  connecting: "Connecting",
  enrolled: "Enrolled",
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
  revoked: "Revoked",
  unavailable: "Unavailable",
};

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

function StatusBadge({ status }: { status: string }): ReactElement {
  return <Pill className={"mtmc-status mtmc-status-" + status}>{statusLabel(status)}</Pill>;
}

function selectedRecord(state: MtmConnectViewState): ConnectionRecord | undefined {
  const id = state.selectedConnectionId;
  return state.snapshot.connections.find((record) => record.instance.id === id) ?? state.snapshot.connections[0];
}

function selectedAdapter(state: MtmConnectViewState, record: ConnectionRecord | undefined): AdapterDescriptor | undefined {
  return record === undefined ? undefined : state.snapshot.adapters.find((adapter) => adapter.id === record.instance.adapterId);
}

function CapabilityCard({
  capabilityId,
  adapter,
  record,
  runtime,
}: {
  capabilityId: string;
  adapter: AdapterDescriptor;
  record: ConnectionRecord;
  runtime: MtmConnectClientRuntime;
}): ReactElement | null {
  const capability = adapter.capabilities.find((candidate) => candidate.id === capabilityId);
  const binding: CapabilityBinding | undefined = record.instance.bindings[capabilityId];
  if (capability === undefined || binding === undefined) return null;
  return (
    <div className="mtmc-capability" data-testid={"capability-" + capability.id}>
      <div className="mtmc-capability-heading">
        <strong>{capability.label}</strong>
        <small>{capability.role === "primary-world" ? "Primary world" : "Additive capability"}<br />{capability.operations.map((operation) => operation.label + (operation.requiresApproval ? " · approval" : "")).join(", ")}</small>
      </div>
      <div className="mtmc-capability-controls">
        <label className="mtmc-check">
          <input type="checkbox" checked={binding.enabled} onChange={(event) => { runtime.setCapabilityEnabled(capability.id, event.currentTarget.checked); }} />
          Enabled
        </label>
        <label className="mtmc-check">
          <input type="checkbox" checked={binding.modelInvocable} onChange={(event) => { runtime.setModelInvocable(capability.id, event.currentTarget.checked); }} />
          Agent tools
        </label>
        <label className="mtmc-check">
          <input type="checkbox" checked={binding.userInvocable} onChange={(event) => { runtime.setUserInvocable(capability.id, event.currentTarget.checked); }} />
          User actions
        </label>
        <label className="mtmc-field">
          Event policy
          <select value={binding.eventPolicy} onChange={(event) => { runtime.setEventPolicy(capability.id, event.currentTarget.value as EventPolicy); }}>
            {EVENT_POLICIES.map((policy) => <option key={policy} value={policy}>{policy}</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}

function InvocationResult({ state, runtime }: { state: MtmConnectViewState; runtime: MtmConnectClientRuntime }): ReactElement | null {
  const result = state.lastInvocation;
  if (result === undefined) return null;
  const approvalRequired = !result.ok && result.code === "approval-required";
  return (
    <div className="mtmc-invocation">
      <strong>{result.ok ? "Sample operation" : "Operation blocked"}</strong>
      <p>{result.ok ? result.summary : result.message}</p>
      {approvalRequired ? <Button size="sm" variant="primary" className="mtmc-action-button mtmc-action-button-primary" onClick={() => { runtime.approveFirstCapability(); }}>Approve and run</Button> : null}
      {result.ok ? <pre className="mtmc-code">{JSON.stringify(result.data, null, 2)}</pre> : null}
    </div>
  );
}

function EventResult({ state }: { state: MtmConnectViewState }): ReactElement | null {
  const projection = state.lastProjection;
  if (projection === undefined) return null;
  return (
    <div className="mtmc-event">
      <strong>Latest fixture event: {projection.disposition}</strong>
      <p>{projection.reason ?? "Policy projection recorded in the snapshot"} · dedupe {projection.dedupeKey}</p>
    </div>
  );
}

function ConnectionDetail({ state, runtime }: { state: MtmConnectViewState; runtime: MtmConnectClientRuntime }): ReactElement {
  const record = selectedRecord(state);
  const adapter = selectedAdapter(state, record);
  if (record === undefined || adapter === undefined) return <div className="mtmc-empty">No connection selected.</div>;
  const online = record.observation.status === "online";
  const revoked = record.observation.status === "revoked";
  const relatedEvents = state.snapshot.eventHistory.filter((entry) => entry.event.connectionId === record.instance.id);
  const root = record.instance.config.root;
  return (
    <div className="mtmc-detail" data-testid="connection-detail">
      <div className="mtmc-detail-title">
        <div>
          <strong>{record.instance.label}</strong>
          <div><small>{adapter.label} · {record.instance.fixture ? "fixture" : "managed"}</small></div>
        </div>
        <StatusBadge status={record.observation.status} />
      </div>
      <div className="mtmc-detail-meta">
        <div className="mtmc-meta-row"><span>Desired</span><strong>{record.instance.desired}</strong></div>
        <div className="mtmc-meta-row"><span>Channel generation</span><strong>{record.observation.generation}</strong></div>
        <div className="mtmc-meta-row"><span>World binding</span><strong>{record.instance.worldBinding?.status === "selected" ? record.instance.worldBinding.scope : "Additive target"}</strong></div>
        <div className="mtmc-meta-row"><span>Target</span><strong>{String(root ?? adapter.capabilities[0]?.supportedTargets[0] ?? "fixture")}</strong></div>
      </div>
      <div className="mtmc-actions">
        <Button size="sm" variant="primary" className="mtmc-action-button mtmc-action-button-primary" disabled={online || revoked} onClick={() => { runtime.enableSelected(); }}>{online ? "Online" : "Enable"}</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button" disabled={!online} onClick={() => { runtime.disableSelected(); }}>Disable</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button" disabled={!online} onClick={() => { runtime.reconnectSelected(); }}>Reconnect</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button mtmc-action-button-danger" disabled={revoked} onClick={() => { runtime.revokeSelected(); }}>Revoke</Button>
      </div>
      <div className="mtmc-subheading"><h5>Capabilities</h5><span>{adapter.capabilities.length} declared</span></div>
      {adapter.capabilities.map((capability) => <CapabilityCard key={capability.id} capabilityId={capability.id} adapter={adapter} record={record} runtime={runtime} />)}
      <div className="mtmc-actions">
        <Button size="sm" variant="outline" className="mtmc-action-button" disabled={!online} onClick={() => { runtime.invokeFirstCapability(); }}>Run sample operation</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button" disabled={!online} onClick={() => { runtime.simulateEvent(); }}>Emit fixture event</Button>
      </div>
      <InvocationResult state={state} runtime={runtime} />
      <EventResult state={state} />
      {relatedEvents.length > 0 ? <div className="mtmc-subheading"><h5>Event history</h5><span>{relatedEvents.length} recorded</span></div> : null}
      {relatedEvents.length > 0 ? <div className="mtmc-event"><strong>{relatedEvents[relatedEvents.length - 1]?.event.kind}</strong><p>Generation {relatedEvents[relatedEvents.length - 1]?.event.generation} · {relatedEvents[relatedEvents.length - 1]?.projection.disposition}</p></div> : null}
    </div>
  );
}

function UnavailableCatalog({ state }: { state: MtmConnectViewState }): ReactElement {
  const adapters = state.snapshot.adapters.filter((adapter) => adapter.status === "unavailable");
  return (
    <div className="mtmc-unavailable">
      <strong>Unavailable adapters</strong>
      {adapters.map((adapter) => <p key={adapter.id}><StatusBadge status="unavailable" /> {adapter.label} · {adapter.availabilityNote}</p>)}
    </div>
  );
}

function MtmConnectPanel({ state, runtime }: { state: MtmConnectViewState; runtime: MtmConnectClientRuntime }): ReactElement {
  const online = state.snapshot.connections.filter((record) => record.observation.status === "online").length;
  const enabled = state.snapshot.connections.filter((record) => record.instance.desired === "enabled").length;
  const unavailable = state.snapshot.adapters.filter((adapter) => adapter.status === "unavailable").length;
  return (
    <div data-mtm-connect="true" data-testid="mtm-connect-panel">
      <div className="mtmc-header">
        <div><h3>Connection control plane</h3><p>Explicit bindings, observable channels, and fixture adapters.</p></div>
        <div className="mtmc-metadata">snapshot v1 · rev {state.snapshot.revision}<br />owner {state.snapshot.ownerId}</div>
      </div>
      <div className="mtmc-summary">
        <div className="mtmc-summary-item"><strong>{state.snapshot.connections.length}</strong><span>Connections</span></div>
        <div className="mtmc-summary-item"><strong>{enabled}</strong><span>Enabled</span></div>
        <div className="mtmc-summary-item"><strong>{online}</strong><span>Online</span></div>
        <div className="mtmc-summary-item"><strong>{unavailable}</strong><span>Unavailable</span></div>
      </div>
      {state.loading ? <div className="mtmc-notice" role="status">Loading Host snapshot</div> : null}
      <div className="mtmc-layout">
        <section className="mtmc-section">
          <div className="mtmc-section-header"><h4>Connections</h4><div className="mtmc-actions"><Button size="sm" variant="outline" className="mtmc-action-button" onClick={() => { runtime.refresh(); }}>Refresh</Button><Button size="sm" variant="outline" className="mtmc-action-button" disabled={state.loading} onClick={() => { runtime.createMockConnection(); }}>Add fixture</Button></div></div>
          <div className="mtmc-connection-list">
            {state.snapshot.connections.length === 0 ? <div className="mtmc-empty">No connections configured.</div> : state.snapshot.connections.map((record) => (
              <button type="button" className={"mtmc-connection" + (record.instance.id === state.selectedConnectionId ? " mtmc-connection-selected" : "")} key={record.instance.id} onClick={() => { runtime.selectConnection(record.instance.id); }}>
                <div className="mtmc-connection-copy"><strong>{record.instance.label}</strong><small>{record.instance.adapterId} · gen {record.observation.generation}</small></div>
                <StatusBadge status={record.observation.status} />
              </button>
            ))}
          </div>
        </section>
        <section className="mtmc-section"><ConnectionDetail state={state} runtime={runtime} /></section>
      </div>
      <UnavailableCatalog state={state} />
      {state.notice !== undefined ? <div className="mtmc-notice" role="status">{state.notice}</div> : null}
    </div>
  );
}

export function MtmConnectAction({ wide, runtime }: MtmConnectActionProps): ReactElement {
  const [open, setOpen] = useState(false);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  const label = "Open MTM Connect";
  return (
    <>
      <Button aria-label={label} title={label} variant="ghost" size={wide ? "md" : "sm"} icon={<IconCodeOutline16 size={wide ? 16 : 18} />} onClick={() => { setOpen(true); }}>
        {wide ? "MTM Connect" : null}
      </Button>
      <Modal open={open} onClose={() => { setOpen(false); }} title="MTM Connect" closeLabel="Close MTM Connect panel" description="Experimental connection control plane">
        <MtmConnectPanel state={state} runtime={runtime} />
      </Modal>
    </>
  );
}
