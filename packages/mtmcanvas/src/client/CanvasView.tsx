import { useEffect, useRef, useState, type DragEvent, type FormEvent, type ReactElement } from "react";
import type { CanvasNode } from "../contract/canvas.ts";
import type { CanvasActions, CanvasViewState } from "./runtime.ts";

function NodeCard({ node, selected, onSelect, onDragEnd }: { node: CanvasNode; selected: boolean; onSelect: () => void; onDragEnd: (event: DragEvent<HTMLElement>) => void }): ReactElement {
  return (
    <article
      className={"mtmcanvas-node" + (selected ? " mtmcanvas-node-selected" : "")}
      style={{ left: node.position.x, top: node.position.y, width: node.size.width, minHeight: node.size.height }}
      draggable
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      <button type="button" className="mtmcanvas-node-title" onClick={onSelect} aria-pressed={selected}>
        <strong>{node.kind === "prompt" ? "Prompt" : "Image"}</strong>
      </button>
      {node.kind === "prompt" ? <p>{node.prompt || "Empty prompt"}</p> : <div className="mtmcanvas-empty-preview">Image output</div>}
    </article>
  );
}

export function CanvasView({ state, actions }: { state: CanvasViewState; actions: CanvasActions }): ReactElement {
  const stageRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [draft, setDraft] = useState("");
  const [filename, setFilename] = useState("untitled.canvas");
  const document = state.document;
  const selected = document?.nodes.find((node) => node.id === selectedId);

  useEffect(() => {
    if (selected?.kind === "prompt") setDraft(selected.prompt);
  }, [selected]);

  function create(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const name = filename.endsWith(".canvas") ? filename : filename + ".canvas";
    actions.create(name);
  }

  function moveNode(node: CanvasNode, event: DragEvent<HTMLElement>): void {
    const rect = stageRef.current?.getBoundingClientRect();
    const viewport = document?.viewport;
    if (rect === undefined || viewport === undefined) return;
    actions.moveNode(node.id, {
      x: Math.max(0, (event.clientX - rect.left - viewport.x) / viewport.k - node.size.width / 2),
      y: Math.max(0, (event.clientY - rect.top - viewport.y) / viewport.k - 24 / viewport.k),
    });
  }

  function zoom(delta: number): void {
    if (document === undefined) return;
    actions.setViewport({ ...document.viewport, k: Math.min(5, Math.max(0.05, document.viewport.k + delta)) });
  }

  return (
    <section className="mtmcanvas-view" aria-label="MTM Canvas">
      <header className="mtmcanvas-header">
        <div className="mtmcanvas-heading"><strong>Canvas</strong><span>{state.name ?? "No file selected"}</span></div>
        <div className="mtmcanvas-header-actions">
          <button type="button" onClick={() => zoom(-0.1)} disabled={document === undefined} aria-label="Zoom out">-</button>
          <span>{document === undefined ? "--" : Math.round(document.viewport.k * 100) + "%"}</span>
          <button type="button" onClick={() => zoom(0.1)} disabled={document === undefined} aria-label="Zoom in">+</button>
          <button type="button" onClick={actions.save} disabled={document === undefined || state.version === undefined}>Save</button>
        </div>
      </header>
      <div className="mtmcanvas-content">
        <aside className="mtmcanvas-files" aria-label="Canvas files">
          <form onSubmit={create} className="mtmcanvas-create-form">
            <input value={filename} onChange={(event) => setFilename(event.target.value)} aria-label="Canvas filename" />
            <button type="submit">Create</button>
          </form>
          {state.loading && state.files.length === 0 ? <span>Loading files...</span> : null}
          {state.files.map((file) => (
            <button key={file.name} type="button" className={file.name === state.name ? "mtmcanvas-file-selected" : ""} onClick={() => actions.open(file.name)}>
              {file.name}
            </button>
          ))}
          {state.files.length === 0 && !state.loading ? <span>No canvas files yet.</span> : null}
        </aside>
        <div ref={stageRef} className="mtmcanvas-stage" aria-label="Canvas stage">
          {document === undefined ? <span className="mtmcanvas-stage-empty">Create or open a canvas file.</span> : (
            <div className="mtmcanvas-layer" style={{ transform: "translate(" + document.viewport.x + "px, " + document.viewport.y + "px) scale(" + document.viewport.k + ")" }}>
              {document.connections.map((connection) => {
                const from = document.nodes.find((node) => node.id === connection.fromNodeId);
                const to = document.nodes.find((node) => node.id === connection.toNodeId);
                if (from === undefined || to === undefined) return null;
                const width = to.position.x - from.position.x - from.size.width;
                if (width <= 0) return null;
                return <div key={connection.id} className="mtmcanvas-connection" style={{ left: from.position.x + from.size.width, top: from.position.y + from.size.height / 2, width }} />;
              })}
              {document.nodes.map((node) => <NodeCard key={node.id} node={node} selected={node.id === selectedId} onSelect={() => setSelectedId(node.id)} onDragEnd={(event) => moveNode(node, event)} />)}
            </div>
          )}
        </div>
        <aside className="mtmcanvas-inspector" aria-label="Canvas inspector">
          <button type="button" onClick={() => actions.addPrompt()} disabled={document === undefined}>Add prompt</button>
          {selected?.kind === "prompt" ? (
            <>
              <label htmlFor="mtmcanvas-prompt">Prompt</label>
              <textarea id="mtmcanvas-prompt" value={draft} onChange={(event) => setDraft(event.target.value)} />
              <button type="button" onClick={() => actions.updatePrompt(selected.id, draft)}>Apply</button>
            </>
          ) : <span>Select a prompt node to edit it.</span>}
          {state.error ? <p className="mtmcanvas-error" role="alert">{state.error}</p> : null}
          {state.conflict && state.name !== undefined ? <button type="button" onClick={() => { if (state.name !== undefined) actions.open(state.name); }}>Reload file</button> : null}
        </aside>
      </div>
    </section>
  );
}
