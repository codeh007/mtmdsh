export const MTM_CONNECT_CSS = String.raw`
.mtm-modal {
  width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  gap: 0;
  padding-bottom: 16px;
  border-radius: 16px;
}

.mtm-modal-content {
  min-height: 0;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  scrollbar-gutter: stable;
}

.mtm-trigger-rail {
  width: 36px;
  min-width: 36px;
  height: 28px;
  padding: 0 2px;
  font-size: 11px;
  line-height: 14px;
}

[data-mtm-connect] {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  container-type: inline-size;
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family, sans-serif);
  font-size: 12px;
  line-height: 18px;
}

[data-mtm-connect] .mtmc-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

[data-mtm-connect] .mtmc-header h3 {
  margin: 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 700;
}

[data-mtm-connect] .mtmc-header p {
  margin: 2px 0 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

[data-mtm-connect] .mtmc-summary-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 12px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding: 7px 0;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-summary-line strong {
  color: var(--dsw-alias-label-primary);
  font-size: 12px;
  font-weight: 600;
}

[data-mtm-connect] .mtmc-layout {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}

[data-mtm-connect] .mtmc-section {
  min-width: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-3);
}

[data-mtm-connect] .mtmc-section-header {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding: 0 10px;
}

[data-mtm-connect] .mtmc-section-header h4 {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
  font-weight: 700;
}

[data-mtm-connect] .mtmc-connection-list {
  display: flex;
  max-height: 250px;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding: 6px;
}

[data-mtm-connect] .mtmc-connection {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

[data-mtm-connect] .mtmc-connection:hover,
[data-mtm-connect] .mtmc-connection-selected {
  border-color: var(--dsw-alias-border-l2);
  background: var(--dsw-alias-interactive-bg-hover);
}

[data-mtm-connect] .mtmc-connection:focus-visible,
[data-mtm-connect] .mtmc-action-button:focus-visible,
[data-mtm-connect] .mtmc-field select:focus-visible,
[data-mtm-connect] .mtmc-capability-settings summary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

[data-mtm-connect] .mtmc-connection-copy {
  min-width: 0;
  flex: 1;
}

[data-mtm-connect] .mtmc-connection-copy strong {
  display: block;
  overflow: hidden;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-mtm-connect] .mtmc-connection-copy small {
  display: block;
  overflow: hidden;
  margin-top: 2px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-mtm-connect] .mtmc-status {
  display: inline-flex;
  min-height: 18px;
  height: 18px;
  align-items: center;
  border-radius: 999px;
  padding: 0 6px;
  font-size: 9px;
  line-height: 14px;
  font-weight: 700;
  white-space: nowrap;
}

[data-mtm-connect] .mtmc-status-online {
  background: var(--dsw-alias-state-success-tertiary);
  color: var(--dsw-alias-state-success-primary);
}

[data-mtm-connect] .mtmc-status-configured,
[data-mtm-connect] .mtmc-status-connecting,
[data-mtm-connect] .mtmc-status-authorizing,
[data-mtm-connect] .mtmc-status-enrolled {
  background: var(--dsw-alias-state-warn-tertiary);
  color: var(--dsw-alias-state-warn-label);
}

[data-mtm-connect] .mtmc-status-offline,
[data-mtm-connect] .mtmc-status-degraded {
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-secondary);
}

[data-mtm-connect] .mtmc-status-revoked,
[data-mtm-connect] .mtmc-status-unavailable {
  background: var(--dsw-alias-interactive-bg-hover-danger);
  color: var(--dsw-alias-state-error-primary);
}

[data-mtm-connect] .mtmc-detail {
  min-width: 0;
  padding: 11px;
}

[data-mtm-connect] .mtmc-detail-title {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

[data-mtm-connect] .mtmc-detail-title strong {
  display: block;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-mtm-connect] .mtmc-detail-title small {
  color: var(--dsw-alias-label-tertiary);
  font-family: var(--ds-font-family-code, ui-monospace, SFMono-Regular, monospace);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-detail-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0 12px;
  margin: 9px 0;
}

[data-mtm-connect] .mtmc-meta-row {
  display: flex;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  padding: 5px 0;
}

[data-mtm-connect] .mtmc-meta-row span {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-meta-row strong {
  min-width: 0;
  overflow: hidden;
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

[data-mtm-connect] .mtmc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 9px 0;
}

[data-mtm-connect] .mtmc-action-button {
  flex: none;
}

[data-mtm-connect] .mtmc-action-button-danger {
  border-color: var(--dsw-alias-state-error-secondary);
  color: var(--dsw-alias-state-error-primary);
}

[data-mtm-connect] .mtmc-action-button-danger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
}

[data-mtm-connect] .mtmc-subheading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin: 12px 0 6px;
}

[data-mtm-connect] .mtmc-subheading h5 {
  margin: 0;
  font-size: 11px;
  line-height: 16px;
}

[data-mtm-connect] .mtmc-subheading span {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-capability {
  border-top: 1px solid var(--dsw-alias-border-l2);
  padding: 8px 0;
}

[data-mtm-connect] .mtmc-capability-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

[data-mtm-connect] .mtmc-capability-heading strong {
  min-width: 0;
  font-size: 11px;
  line-height: 16px;
}

[data-mtm-connect] .mtmc-capability-heading small {
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
  text-align: right;
}

[data-mtm-connect] .mtmc-capability-settings {
  margin-top: 5px;
}

[data-mtm-connect] .mtmc-capability-settings summary {
  width: fit-content;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-capability-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 10px;
  margin-top: 8px;
}

[data-mtm-connect] .mtmc-check {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--dsw-alias-label-secondary);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-check input {
  margin: 0;
  accent-color: var(--dsw-alias-state-business-primary);
}

[data-mtm-connect] .mtmc-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-field select {
  min-height: 27px;
  min-width: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 5px;
  padding: 0 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-notice {
  margin: 9px 0 0;
  border-left: 3px solid var(--dsw-alias-state-business-primary);
  padding: 6px 8px;
  background: var(--dsw-alias-state-business-tertiary);
  color: var(--dsw-alias-label-primary);
  font-size: 10px;
  line-height: 14px;
}

[data-mtm-connect] .mtmc-empty {
  padding: 14px 10px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}

@container (min-width: 620px) {
  [data-mtm-connect] .mtmc-layout {
    grid-template-columns: minmax(190px, .72fr) minmax(0, 1.28fr);
  }

  [data-mtm-connect] .mtmc-detail-meta {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-mtm-connect] * {
    scroll-behavior: auto;
  }
}
`.trim();
