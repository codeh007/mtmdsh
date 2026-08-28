export const MTM_CANVAS_CSS =   ".mtmcanvas-view{display:flex;min-height:520px;height:100%;flex-direction:column;background:#f8fafc;color:#172033;font:12px ui-sans-serif,system-ui,sans-serif}" +
  ".mtmcanvas-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid #dbe3ee;background:#fff}" +
  ".mtmcanvas-heading,.mtmcanvas-header-actions{display:flex;align-items:center;gap:8px;min-width:0}" +
  ".mtmcanvas-heading span{overflow:hidden;color:#64748b;text-overflow:ellipsis;white-space:nowrap}" +
  ".mtmcanvas-content{display:grid;min-height:0;flex:1;grid-template-columns:150px minmax(0,1fr) 220px}" +
  ".mtmcanvas-files,.mtmcanvas-inspector{display:flex;min-width:0;flex-direction:column;gap:8px;overflow:auto;border-right:1px solid #dbe3ee;padding:10px;background:#fff}" +
  ".mtmcanvas-inspector{border-right:0;border-left:1px solid #dbe3ee}" +
  ".mtmcanvas-files button,.mtmcanvas-inspector button,.mtmcanvas-header button,.mtmcanvas-header-actions button{min-height:30px;border:1px solid #dbe3ee;border-radius:6px;background:#fff;color:#172033;cursor:pointer;padding:4px 8px}" +
  ".mtmcanvas-files button:hover,.mtmcanvas-inspector button:hover,.mtmcanvas-header button:hover{background:#eff6ff}" +
  ".mtmcanvas-files button:disabled,.mtmcanvas-inspector button:disabled,.mtmcanvas-header button:disabled{cursor:not-allowed;opacity:.5}" +
  ".mtmcanvas-files input,.mtmcanvas-inspector textarea{min-width:0;width:100%;border:1px solid #cbd5e1;border-radius:6px;padding:6px;background:#fff;color:#172033;font:inherit}" +
  ".mtmcanvas-create-form{display:flex;gap:4px}" +
  ".mtmcanvas-create-form button{flex-shrink:0}" +
  ".mtmcanvas-file-selected{border-color:#2563eb!important;background:#eff6ff!important}" +
  ".mtmcanvas-stage{position:relative;min-height:400px;overflow:hidden;background-color:#f8fbff;background-image:linear-gradient(#dbe7f3 1px,transparent 1px),linear-gradient(90deg,#dbe7f3 1px,transparent 1px);background-size:28px 28px}" +
  ".mtmcanvas-layer{position:absolute;inset:0;transform-origin:0 0}" +
  ".mtmcanvas-node{position:absolute;overflow:hidden;border:1px solid #cbd5e1;border-radius:8px;padding:10px;background:#fff;box-shadow:0 8px 22px #1e405a1f;cursor:grab}" +
  ".mtmcanvas-node:active{cursor:grabbing}" +
  ".mtmcanvas-node-selected{border-color:#2563eb;box-shadow:0 0 0 2px #2563eb29}" +
  ".mtmcanvas-node-title{display:block;width:100%;border:0;background:transparent;text-align:left;cursor:pointer;padding:0;color:#172033}" +
  ".mtmcanvas-node p{margin:10px 0 0;color:#64748b;line-height:1.5;white-space:pre-wrap}" +
  ".mtmcanvas-empty-preview,.mtmcanvas-stage-empty{display:grid;min-height:150px;place-items:center;color:#64748b}" +
  ".mtmcanvas-empty-preview{border:1px dashed #cbd5e1}" +
  ".mtmcanvas-stage-empty{position:absolute;inset:0}" +
  ".mtmcanvas-connection{position:absolute;height:2px;background:#64748b;transform:translateY(-1px)}" +
  ".mtmcanvas-inspector label{font-weight:600}" +
  ".mtmcanvas-inspector textarea{min-height:130px;resize:vertical}" +
  ".mtmcanvas-error{margin:0;color:#b91c1c;line-height:1.5;overflow-wrap:anywhere}" +
  "@media(max-width:760px){.mtmcanvas-content{grid-template-columns:110px minmax(0,1fr);grid-template-rows:minmax(300px,1fr) auto}.mtmcanvas-inspector{grid-column:1/-1;border-top:1px solid #dbe3ee;border-left:0}.mtmcanvas-header{align-items:flex-start}.mtmcanvas-heading{flex-direction:column;align-items:flex-start;gap:2px}}";
