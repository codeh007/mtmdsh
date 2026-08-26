import { useState, type CSSProperties } from "react";
import type { InjectFace, PropsLocale, PropsRuntime } from "@deepseek-ai/dsh-client-ui-slots";
import type { MtmCodingCardFace, MtmCodingCardState } from "./controller.js";
import { MODE_VALUES } from "./controller.js";
import type { MtmCodingLocaleKey } from "./locales.js";
import type {} from "@deepseek-ai/dsh-client-ui-settings-plugins/client";

export type MtmCodingCardProps =
  PropsRuntime<"settings.plugin.item">
  & PropsLocale<"mtm.coding">
  & InjectFace<MtmCodingCardFace>;

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
const fieldStyle: CSSProperties = { borderBottom: "1px solid color-mix(in srgb, currentColor 10%, transparent)", display: "grid", gap: 4, padding: "10px 0" };
const labelStyle: CSSProperties = { alignItems: "center", display: "flex", gap: 8, fontWeight: 600 };
const hintStyle: CSSProperties = { fontSize: 12, margin: 0, opacity: 0.68 };
const actionStyle: CSSProperties = { display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 14 };
const buttonStyle: CSSProperties = { border: "1px solid color-mix(in srgb, currentColor 22%, transparent)", borderRadius: 4, cursor: "pointer", padding: "6px 10px" };

function fieldLabel(t: (key: MtmCodingLocaleKey) => string, label: MtmCodingLocaleKey, field: { overridden: boolean }, reset: () => void, disabled: boolean) {
  return (
    <span style={labelStyle}>
      <span>{t(label)}</span>
      {field.overridden ? <button type="button" style={{ ...buttonStyle, fontSize: 11, padding: "2px 6px" }} onClick={reset} disabled={disabled}>{t("reset")}</button> : null}
    </span>
  );
}

function BooleanField(props: {
  t: (key: MtmCodingLocaleKey) => string;
  label: MtmCodingLocaleKey;
  hint: MtmCodingLocaleKey;
  field: { text: string; overridden: boolean };
  disabled: boolean;
  onChange: (value: boolean) => void;
  onReset: () => void;
}) {
  return (
    <div style={fieldStyle}>
      {fieldLabel(props.t, props.label, props.field, props.onReset, props.disabled)}
      <label style={{ alignItems: "center", display: "flex", gap: 8 }}>
        <input
          type="checkbox"
          role="switch"
          checked={props.field.text === "true"}
          disabled={props.disabled}
          onChange={(event) => { props.onChange(event.target.checked); }}
        />
        <span>{props.field.text === "true" ? "On" : "Off"}</span>
      </label>
      <p style={hintStyle}>{props.t(props.hint)}</p>
    </div>
  );
}

export function MtmCodingCard(props: MtmCodingCardProps) {
  const t = props.t;
  const state = props.useMtmCodingCard((snapshot: MtmCodingCardState) => snapshot);
  const [open, setOpen] = useState(false);
  if (!state.available) return null;
  const disabled = !state.writable;
  const mode = state.fields.ponytailMode;
  return (
    <li style={cardStyle}>
      <button type="button" style={headerStyle} aria-expanded={open} aria-label={t(open ? "hide" : "show")} onClick={() => { setOpen(value => !value); }}>
        <span>
          <strong style={{ display: "block" }}>{t("title")}</strong>
          <span style={{ display: "block", fontSize: 12, opacity: 0.68 }}>{t("description")}</span>
        </span>
        <span aria-hidden="true">{open ? "-" : "+"}</span>
      </button>
      {open ? (
        <div style={bodyStyle}>
          {disabled ? <p role="status">{t("readOnly")}</p> : null}
          <BooleanField t={t} label="codebaseMemoryEnabled" hint="codebaseMemoryEnabledHint" field={state.fields.codebaseMemoryEnabled} disabled={disabled} onChange={(value) => { props.edit("codebaseMemoryEnabled", String(value)); }} onReset={() => { props.resetField("codebaseMemoryEnabled"); }} />
          <BooleanField t={t} label="codebaseMemoryAugmentHooks" hint="codebaseMemoryAugmentHooksHint" field={state.fields.codebaseMemoryAugmentHooks} disabled={disabled} onChange={(value) => { props.edit("codebaseMemoryAugmentHooks", String(value)); }} onReset={() => { props.resetField("codebaseMemoryAugmentHooks"); }} />
          <BooleanField t={t} label="ponytailEnabled" hint="ponytailEnabledHint" field={state.fields.ponytailEnabled} disabled={disabled} onChange={(value) => { props.edit("ponytailEnabled", String(value)); }} onReset={() => { props.resetField("ponytailEnabled"); }} />
          <div style={fieldStyle}>
            {fieldLabel(t, "ponytailMode", mode, () => { props.resetField("ponytailMode"); }, disabled)}
            <select value={mode.text} disabled={disabled} onChange={(event) => { props.edit("ponytailMode", event.target.value); }}>
              {MODE_VALUES.map(value => <option key={value} value={value}>{t(("mode" + value[0].toUpperCase() + value.slice(1)) as MtmCodingLocaleKey)}</option>)}
            </select>
            <p style={hintStyle}>{t("ponytailModeHint")}</p>
          </div>
          <BooleanField t={t} label="ponytailSubagents" hint="ponytailSubagentsHint" field={state.fields.ponytailSubagents} disabled={disabled} onChange={(value) => { props.edit("ponytailSubagents", String(value)); }} onReset={() => { props.resetField("ponytailSubagents"); }} />
          <div style={actionStyle}>
            {state.failed ? <span role="status" style={{ color: "#b42318", marginRight: "auto" }}>{t("saveFailed")}</span> : null}
            {state.dirty ? <span style={{ marginRight: "auto", opacity: 0.68 }}>{t("unsaved")}</span> : null}
            <button type="button" style={buttonStyle} disabled={!state.dirty || state.saving} onClick={props.discard}>{t("discard")}</button>
            <button type="button" style={buttonStyle} disabled={!state.dirty || state.invalid || state.saving || disabled} onClick={props.save}>{t(state.saving ? "saving" : "save")}</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
