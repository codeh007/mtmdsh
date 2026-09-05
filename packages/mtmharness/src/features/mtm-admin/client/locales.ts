export type MtmAdminLocaleKey =
  | "title"
  | "description"
  | "enabled"
  | "enabledHint"
  | "reset"
  | "statusDisabled"
  | "statusLoading"
  | "statusEnabled"
  | "statusFailed"
  | "open"
  | "save"
  | "saving"
  | "discard"
  | "unsaved"
  | "saveFailed"
  | "readOnly"
  | "show"
  | "hide";

export const en: Record<MtmAdminLocaleKey, string> = {
  title: "MTM Admin",
  description: "Independent gomtm control-plane application.",
  enabled: "Enabled",
  enabledHint: "Load the pinned Admin launcher at runtime.",
  reset: "Reset",
  statusDisabled: "Disabled",
  statusLoading: "Loading",
  statusEnabled: "Ready",
  statusFailed: "Failed",
  open: "Open Admin",
  save: "Save",
  saving: "Saving...",
  discard: "Discard",
  unsaved: "Unsaved",
  saveFailed: "The setting could not be saved; your edit was kept.",
  readOnly: "This deployment stores settings read-only.",
  show: "Show settings",
  hide: "Hide settings",
};

export const zh: Record<MtmAdminLocaleKey, string> = {
  title: "MTM 管理员",
  description: "独立的 gomtm 控制面应用。",
  enabled: "启用",
  enabledHint: "运行时加载固定版本的 Admin 入口。",
  reset: "恢复默认",
  statusDisabled: "已禁用",
  statusLoading: "加载中",
  statusEnabled: "就绪",
  statusFailed: "失败",
  open: "打开 Admin",
  save: "保存",
  saving: "保存中...",
  discard: "放弃修改",
  unsaved: "未保存",
  saveFailed: "设置保存失败，修改仍保留供你修正。",
  readOnly: "本部署的设置为只读。",
  show: "展开设置",
  hide: "收起设置",
};
