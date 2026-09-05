import { useState, type CSSProperties } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { MtmAdminCardFace, MtmAdminCardState } from "./controller.js";
import type { MtmAdminLocaleKey } from "./locales.js";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";

export type MtmAdminCardProps =
  PropsRuntime<"settings.plugin.item">
  & PropsLocale<"mtm.admin">
  & InjectFace<MtmAdminCardFace>;

const cardStyle: CSSProperties = {
  border: "1px solid color-mix(in srgb, currentColor 16%, transparent)",
  borderRadius: 6,
  listStyle: "none",
  margin: "0 0 12px",
  overflow: "hidden",
};
const headerStyle: CSSProperties = {
  alignItems: "center",
  background: "transparent",
  border: 0,
  color: "inherit",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  padding: "12px 14px",
  textAlign: "left",
  width: "100%",
};
const bodyStyle: CSSProperties = { borderTop: "1px solid color-mix(in srgb, currentColor 12%, transparent)", padding: "12px 14px 14px" };
const actionStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end", paddingTop: 14 };
const buttonStyle: CSSProperties = { border: "1px solid color-mix(in srgb, currentColor 22%, transparent)", borderRadius: 4, cursor: "pointer", padding: "6px 10px" };

function statusLabel(t: (key: MtmAdminLocaleKey) => string, state: MtmAdminCardState): string {
  if (state.status === "disabled") return t("statusDisabled");
  if (state.status === "loading") return t("statusLoading");
  if (state.status === "failed") return t("statusFailed");
  return t("statusEnabled");
}

export function MtmAdminCard(props: MtmAdminCardProps) {
  const t = props.t;
  const state = props.useMtmAdminCard((snapshot: MtmAdminCardState) => snapshot);
  const [open, setOpen] = useState(false);
  if (!state.available) return null;
  const disabled = !state.writable;
  return (
    <li style={cardStyle}>
      <button type="button" style={headerStyle} aria-expanded={open} aria-controls="mtm-admin-settings-panel" aria-label={t("title") + ": " + t(open ? "hide" : "show")} onClick={() => { setOpen(value => !value); }}>
        <span>
          <strong id="mtm-admin-settings-heading" style={{ display: "block" }}>{t("title")}</strong>
          <span style={{ display: "block", fontSize: 12, opacity: 0.68 }}>{t("description")} · {statusLabel(t, state)}</span>
        </span>
        <span aria-hidden="true">{open ? "-" : "+"}</span>
      </button>
      {open ? (
        <div id="mtm-admin-settings-panel" role="region" aria-labelledby="mtm-admin-settings-heading" style={bodyStyle}>
          {disabled ? <p role="status">{t("readOnly")}</p> : null}
          {state.error ? <p role="alert">{state.error}</p> : null}
          <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
            <input type="checkbox" role="switch" checked={state.enabled} disabled={disabled || state.saving} onChange={(event) => { props.edit(event.target.checked); }} />
            <span>{t("enabled")}</span>
          </label>
          <p style={{ fontSize: 12, margin: "6px 0 0", opacity: 0.68 }}>{t("enabledHint")}</p>
          <div style={actionStyle}>
            {state.dirty ? <span style={{ marginRight: "auto", opacity: 0.68 }}>{t("unsaved")}</span> : null}
            {state.failed ? <span role="status" style={{ color: "#b42318", marginRight: "auto" }}>{t("saveFailed")}</span> : null}
            <button type="button" style={buttonStyle} disabled={!state.enabled || state.status !== "enabled" || state.saving} onClick={props.open}>{t("open")}</button>
            {state.overridden ? <button type="button" style={buttonStyle} disabled={disabled || state.saving} onClick={props.reset}>{t("reset")}</button> : null}
            <button type="button" style={buttonStyle} disabled={!state.dirty || state.saving} onClick={props.discard}>{t("discard")}</button>
            <button type="button" style={buttonStyle} disabled={!state.dirty || state.saving || disabled} onClick={props.save}>{t(state.saving ? "saving" : "save")}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
