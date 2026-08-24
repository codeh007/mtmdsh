import type { ReactElement } from "react";
import { Button, Pill } from "@deepseek-ai/dsh-client-ui-primitives";
import { EVENT_POLICIES, type EventPolicy } from "../contract/event.ts";
import type { CapabilityBinding, ConnectionRecord } from "../contract/connection.ts";
import type { AdapterDescriptor } from "../contract/adapter.ts";
import type { MtmConnectClientActions, MtmConnectViewState } from "./runtime.ts";

export type MtmConnectPanelActions = Pick<MtmConnectClientActions,
  | "selectConnection"
  | "refresh"
  | "createMockConnection"
  | "enableSelected"
  | "disableSelected"
  | "revokeSelected"
  | "reconnectSelected"
  | "setCapabilityEnabled"
  | "setModelInvocable"
  | "setUserInvocable"
  | "setEventPolicy"
>;

const STATUS_LABELS: Record<string, string> = {
  configured: "已配置",
  authorizing: "授权中",
  connecting: "连接中",
  enrolled: "已注册",
  online: "在线",
  degraded: "降级",
  offline: "离线",
  revoked: "已撤销",
  unavailable: "不可用",
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
  actions,
}: {
  capabilityId: string;
  adapter: AdapterDescriptor;
  record: ConnectionRecord;
  actions: MtmConnectPanelActions;
}): ReactElement | null {
  const capability = adapter.capabilities.find((candidate) => candidate.id === capabilityId);
  const binding: CapabilityBinding | undefined = record.instance.bindings[capabilityId];
  if (capability === undefined || binding === undefined) return null;
  return (
    <div className="mtmc-capability" data-testid={"capability-" + capability.id}>
      <div className="mtmc-capability-heading">
        <strong>{capability.label}</strong>
        <small>{capability.role === "primary-world" ? "主执行环境" : "附加能力"}<br />{capability.operations.map((operation) => operation.label + (operation.requiresApproval ? " · 需确认" : "")).join(", ")}</small>
      </div>
      <details className="mtmc-capability-settings">
        <summary>能力策略</summary>
        <div className="mtmc-capability-controls">
          <label className="mtmc-check">
            <input type="checkbox" checked={binding.enabled} onChange={(event) => { actions.setCapabilityEnabled(capability.id, event.currentTarget.checked); }} />
            已启用
          </label>
          <label className="mtmc-check">
            <input type="checkbox" checked={binding.modelInvocable} onChange={(event) => { actions.setModelInvocable(capability.id, event.currentTarget.checked); }} />
            Agent 可调用
          </label>
          <label className="mtmc-check">
            <input type="checkbox" checked={binding.userInvocable} onChange={(event) => { actions.setUserInvocable(capability.id, event.currentTarget.checked); }} />
            用户可操作
          </label>
          <label className="mtmc-field">
            事件策略
            <select value={binding.eventPolicy} onChange={(event) => { actions.setEventPolicy(capability.id, event.currentTarget.value as EventPolicy); }}>
              {EVENT_POLICIES.map((policy) => <option key={policy} value={policy}>{policy}</option>)}
            </select>
          </label>
        </div>
      </details>
    </div>
  );
}

function ConnectionDetail({ state, actions }: { state: MtmConnectViewState; actions: MtmConnectPanelActions }): ReactElement {
  const record = selectedRecord(state);
  const adapter = selectedAdapter(state, record);
  if (record === undefined || adapter === undefined) return <div className="mtmc-empty">暂无可用连接</div>;
  const online = record.observation.status === "online";
  const revoked = record.observation.status === "revoked";
  const root = record.instance.config.root;
  return (
    <div className="mtmc-detail" data-testid="connection-detail">
      <div className="mtmc-detail-title">
        <div>
          <strong>{record.instance.label}</strong>
          <div><small>{adapter.label} · {record.instance.fixture ? "测试连接" : "托管连接"}</small></div>
        </div>
        <StatusBadge status={record.observation.status} />
      </div>
      <div className="mtmc-detail-meta">
        <div className="mtmc-meta-row"><span>目标状态</span><strong>{record.instance.desired === "enabled" ? "启用" : "停用"}</strong></div>
        <div className="mtmc-meta-row"><span>连接代次</span><strong>{record.observation.generation}</strong></div>
        <div className="mtmc-meta-row"><span>目标</span><strong>{String(root ?? adapter.capabilities[0]?.supportedTargets[0] ?? "测试环境")}</strong></div>
      </div>
      <div className="mtmc-actions">
        <Button size="sm" variant="primary" className="mtmc-action-button mtmc-action-button-primary" disabled={online || revoked} onClick={() => { actions.enableSelected(); }}>{online ? "在线" : "启用"}</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button" disabled={!online} onClick={() => { actions.disableSelected(); }}>停用</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button" disabled={!online} onClick={() => { actions.reconnectSelected(); }}>重连</Button>
        <Button size="sm" variant="outline" className="mtmc-action-button mtmc-action-button-danger" disabled={revoked} onClick={() => { actions.revokeSelected(); }}>撤销</Button>
      </div>
      <div className="mtmc-subheading"><h5>能力</h5><span>{adapter.capabilities.length} 项</span></div>
      {adapter.capabilities.map((capability) => <CapabilityCard key={capability.id} capabilityId={capability.id} adapter={adapter} record={record} actions={actions} />)}
    </div>
  );
}

export function MtmConnectPanel({ state, actions }: { state: MtmConnectViewState; actions: MtmConnectPanelActions }): ReactElement {
  const online = state.snapshot.connections.filter((record) => record.observation.status === "online").length;
  const enabled = state.snapshot.connections.filter((record) => record.instance.desired === "enabled").length;
  return (
    <div data-mtm-connect="true" data-testid="mtm-connect-panel">
      <div className="mtmc-header">
        <div><h3>连接</h3><p>管理连接状态和可用能力。</p></div>
      </div>
      <div className="mtmc-summary-line" aria-label="连接摘要">
        <span><strong>{state.snapshot.connections.length}</strong> 个连接</span>
        <span><strong>{enabled}</strong> 个已启用</span>
        <span><strong>{online}</strong> 个在线</span>
      </div>
      {state.loading ? <div className="mtmc-notice" role="status">正在读取连接状态</div> : null}
      <div className="mtmc-layout">
        <section className="mtmc-section">
          <div className="mtmc-section-header"><h4>连接</h4><div className="mtmc-actions"><Button size="sm" variant="outline" className="mtmc-action-button" onClick={() => { actions.refresh(); }}>刷新</Button><Button size="sm" variant="outline" className="mtmc-action-button" disabled={state.loading} onClick={() => { actions.createMockConnection(); }}>添加测试连接</Button></div></div>
          <div className="mtmc-connection-list">
            {state.snapshot.connections.length === 0 ? <div className="mtmc-empty">暂无连接</div> : state.snapshot.connections.map((record) => (
              <button type="button" className={"mtmc-connection" + (record.instance.id === state.selectedConnectionId ? " mtmc-connection-selected" : "")} key={record.instance.id} onClick={() => { actions.selectConnection(record.instance.id); }}>
                <div className="mtmc-connection-copy"><strong>{record.instance.label}</strong><small>{record.instance.adapterId} · 第 {record.observation.generation} 代</small></div>
                <StatusBadge status={record.observation.status} />
              </button>
            ))}
          </div>
        </section>
        <section className="mtmc-section"><ConnectionDetail state={state} actions={actions} /></section>
      </div>
      {state.notice !== undefined ? <div className="mtmc-notice" role="status">{state.notice}</div> : null}
    </div>
  );
}
