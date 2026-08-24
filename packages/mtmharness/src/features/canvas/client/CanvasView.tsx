import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent } from "react";
import type { ConvViewProps } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { CanvasConnection, CanvasNode, CanvasPosition, CanvasViewport } from "../contract/canvas.ts";
import type { CanvasViewState } from "./runtime.ts";

type CanvasViewProps = ConvViewProps;

function statusLabel(state: CanvasViewState): string {
  if (state.task?.status === "queued") return "Queued";
  if (state.task?.status === "running") return "Rendering";
  if (state.task?.status === "succeeded") return "Ready";
  if (state.task?.status === "failed") return "Failed";
  if (state.task?.status === "cancelled") return "Cancelled";
  return "Idle";
}

function nodeStatus(node: CanvasNode): string {
  if (node.status === "queued") return "Queued";
  if (node.status === "running") return "Running";
  if (node.status === "succeeded") return "Ready";
  if (node.status === "failed") return "Failed";
  return node.kind === "prompt" ? "Prompt" : "Image";
}

function NodeCard({ node, selected, onSelect, onDragStart, onDragMove, onDragEnd }: {
  node: CanvasNode;
  selected: boolean;
  onSelect: (id: string) => void;
  onDragStart: (event: ReactPointerEvent<HTMLElement>, node: CanvasNode) => void;
  onDragMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onDragEnd: (event: ReactPointerEvent<HTMLElement>) => void;
}): ReactElement {
  return (
    <article
      className={"mtmcanvas-node" + (selected ? " mtmcanvas-node-selected" : "")}
      style={{ left: node.position.x, top: node.position.y, width: node.size.width, minHeight: node.size.height }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={node.title}
      onClick={() => onSelect(node.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node.id);
        }
      }}
      onPointerDown={(event) => onDragStart(event, node)}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
    >
      <div className="mtmcanvas-node-header">
        <span className="mtmcanvas-node-name">{node.title}</span>
        <span className={"mtmcanvas-node-status mtmcanvas-node-status-" + node.status}>{nodeStatus(node)}</span>
      </div>
      {node.kind === "prompt" ? <p className="mtmcanvas-node-prompt">{node.prompt || "Add a visual direction"}</p> : <Preview node={node} />}
    </article>
  );
}

function Preview({ node }: { node: CanvasNode }): ReactElement {
  if (node.asset?.status !== "ready") return <div className="mtmcanvas-empty-preview">{node.status === "failed" ? "Generation failed" : "Ready for a render"}</div>;
  return (
    <div className="mtmcanvas-preview" aria-label="Fixture image preview">
      <div className="mtmcanvas-preview-sun" />
      <div className="mtmcanvas-preview-subject" />
      <div className="mtmcanvas-preview-ground" />
      <span className="mtmcanvas-preview-label">{node.asset.previewLabel || "Generated image"}</span>
    </div>
  );
}

function Connections({ nodes, connections }: { nodes: CanvasNode[]; connections: CanvasConnection[] }): ReactElement {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return (
    <svg className="mtmcanvas-connections" aria-hidden="true">
      <defs>
        <marker id="mtmcanvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M0 0 L8 4 L0 8 Z" fill="currentColor" />
        </marker>
      </defs>
      {connections.map((connection) => {
        const from = byId.get(connection.fromNodeId);
        const to = byId.get(connection.toNodeId);
        if (from === undefined || to === undefined) return null;
        return <line key={connection.id} x1={from.position.x + from.size.width} y1={from.position.y + from.size.height / 2} x2={to.position.x} y2={to.position.y + to.size.height / 2} stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" markerEnd="url(#mtmcanvas-arrow)" />;
      })}
    </svg>
  );
}

function Stage({ state, selectedId, onSelect, onMove }: {
  state: CanvasViewState;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onMove: (id: string, position: CanvasPosition) => void;
}): ReactElement {
  const [viewport, setViewport] = useState<CanvasViewport>(state.document.viewport);
  const pan = useRef<{ clientX: number; clientY: number; x: number; y: number }>();
  const drag = useRef<{ id: string; clientX: number; clientY: number; position: CanvasPosition }>();

  useEffect(() => {
    setViewport(state.document.viewport);
  }, [state.document.viewport.x, state.document.viewport.y, state.document.viewport.k]);

  function zoom(event: WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const nextK = Math.min(2.2, Math.max(.45, viewport.k * (event.deltaY > 0 ? .9 : 1.1)));
    const worldX = (x - viewport.x) / viewport.k;
    const worldY = (y - viewport.y) / viewport.k;
    setViewport({ x: x - worldX * nextK, y: y - worldY * nextK, k: nextK });
  }

  function startPan(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { clientX: event.clientX, clientY: event.clientY, x: viewport.x, y: viewport.y };
  }

  function movePan(event: ReactPointerEvent<HTMLDivElement>): void {
    if (pan.current === undefined) return;
    setViewport((current) => ({ ...current, x: pan.current!.x + event.clientX - pan.current!.clientX, y: pan.current!.y + event.clientY - pan.current!.clientY }));
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>): void {
    if (pan.current !== undefined) event.currentTarget.releasePointerCapture(event.pointerId);
    pan.current = undefined;
  }

  function startDrag(event: ReactPointerEvent<HTMLElement>, node: CanvasNode): void {
    event.stopPropagation();
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(node.id);
    drag.current = { id: node.id, clientX: event.clientX, clientY: event.clientY, position: node.position };
  }

  function moveDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (drag.current === undefined) return;
    onMove(drag.current.id, { x: drag.current.position.x + (event.clientX - drag.current.clientX) / viewport.k, y: drag.current.position.y + (event.clientY - drag.current.clientY) / viewport.k });
  }

  function endDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (drag.current !== undefined) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = undefined;
  }

  return (
    <div className="mtmcanvas-stage" aria-label="Infinite canvas" onWheel={zoom} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
      <div className="mtmcanvas-world" style={{ transform: "translate(" + viewport.x + "px, " + viewport.y + "px) scale(" + viewport.k + ")" }}>
        <Connections nodes={state.document.nodes} connections={state.document.connections} />
        {state.document.nodes.map((node) => <NodeCard key={node.id} node={node} selected={node.id === selectedId} onSelect={onSelect} onDragStart={startDrag} onDragMove={moveDrag} onDragEnd={endDrag} />)}
      </div>
      <div className="mtmcanvas-stage-controls" aria-label="Canvas controls">
        <button type="button" className="mtmcanvas-button mtmcanvas-button-icon" title="Zoom out" aria-label="Zoom out" onClick={() => setViewport({ ...viewport, k: Math.max(.45, viewport.k - .1) })}>-</button>
        <span>{Math.round(viewport.k * 100)}%</span>
        <button type="button" className="mtmcanvas-button mtmcanvas-button-icon" title="Zoom in" aria-label="Zoom in" onClick={() => setViewport({ ...viewport, k: Math.min(2.2, viewport.k + .1) })}>+</button>
        <button type="button" className="mtmcanvas-button mtmcanvas-button-icon" title="Reset view" aria-label="Reset view" onClick={() => setViewport(state.document.viewport)}>R</button>
      </div>
      <div className="mtmcanvas-stage-hint">Drag the canvas or a node</div>
    </div>
  );
}

function Status({ state }: { state: CanvasViewState }): ReactElement {
  return (
    <div className="mtmcanvas-status" aria-live="polite">
      <span className={"mtmcanvas-status-dot" + (state.busy ? " mtmcanvas-status-dot-live" : "") + (state.error ? " mtmcanvas-status-dot-error" : "")} />
      <span>{statusLabel(state)}</span>
      {state.task ? <span>{state.task.prompt}</span> : null}
    </div>
  );
}

export function CanvasView({ sessionId, useCanvas, canvasActions }: CanvasViewProps): ReactElement {
  const state = useCanvas((value) => value);
  const { addPrompt, moveNode, generate, cancel } = canvasActions;
  const [selectedId, setSelectedId] = useState<string | undefined>("prompt-direction");
  const [draft, setDraft] = useState("");
  const [submitError, setSubmitError] = useState<string>();
  const selected = state.document.nodes.find((node) => node.id === selectedId);
  const promptId = selected?.kind === "prompt" ? selected.id : undefined;

  useEffect(() => {
    if (state.document.nodes.some((node) => node.id === selectedId)) return;
    setSelectedId(state.document.nodes.find((node) => node.kind === "prompt")?.id ?? state.document.nodes[0]?.id);
  }, [selectedId, state.document.nodes]);

  async function submit(): Promise<void> {
    setSubmitError(undefined);
    try {
      await generate(draft || selected?.prompt || "", promptId);
      setDraft("");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="mtmcanvas-view" data-mtmcanvas-view="true" data-session-id={String(sessionId)} aria-label="MTM Canvas">
      <header className="mtmcanvas-header">
        <div className="mtmcanvas-title"><span className="mtmcanvas-mark" aria-hidden="true">C</span><div><h2>MTM Canvas</h2><p>Agent-assisted visual planning</p></div></div>
        <span className="mtmcanvas-revision">rev {state.document.revision}</span>
      </header>
      <div className="mtmcanvas-content">
        <div className="mtmcanvas-stage-column">
          <div className="mtmcanvas-toolbar"><small>{state.document.nodes.length} nodes · {state.document.canvasId}</small><button type="button" className="mtmcanvas-button" onClick={addPrompt}>+ New direction</button></div>
          <Stage state={state} selectedId={selectedId} onSelect={setSelectedId} onMove={moveNode} />
        </div>
        <aside className="mtmcanvas-inspector" aria-label="Canvas controls">
          <h3>Agent brief</h3>
          <p className="mtmcanvas-copy">Describe a visual direction, then let the canvas keep the prompt and output connected.</p>
          <textarea className="mtmcanvas-textarea" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Describe the next image" rows={4} disabled={state.busy} />
          <div><button type="button" className="mtmcanvas-button mtmcanvas-button-primary" onClick={() => void submit()} disabled={state.busy || (!draft.trim() && !selected?.prompt.trim())}>Generate fixture</button>{state.busy ? <button type="button" className="mtmcanvas-button" onClick={cancel}>Cancel</button> : null}</div>
          <Status state={{ ...state, error: submitError || state.error }} />
          {submitError || state.error ? <div className="mtmcanvas-error" role="alert">{submitError || state.error}</div> : null}
          <div className="mtmcanvas-rule" />
          <div className="mtmcanvas-list-title"><span>Nodes</span><span>{state.document.nodes.length}</span></div>
          <div className="mtmcanvas-node-list">{state.document.nodes.map((node) => <button type="button" key={node.id} className={"mtmcanvas-node-list-item" + (node.id === selectedId ? " mtmcanvas-node-list-item-selected" : "")} onClick={() => setSelectedId(node.id)}><strong>{node.title}</strong><small>{node.kind === "prompt" ? node.prompt || "Empty direction" : nodeStatus(node)}</small></button>)}</div>
        </aside>
      </div>
    </section>
  );
}
