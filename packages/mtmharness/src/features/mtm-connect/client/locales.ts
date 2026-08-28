export type MtmConnectLocaleKey =
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

export const en: Record<MtmConnectLocaleKey, string> = {
  title: "MTM Connect",
  description: "Device and execution-world connection frontend.",
  enabled: "Enabled",
  enabledHint: "Load the pinned Connect frontend at runtime.",
  reset: "Reset",
  statusDisabled: "Disabled",
  statusLoading: "Loading",
  statusEnabled: "Ready",
  statusFailed: "Failed",
  open: "Open Connect",
  save: "Save",
  saving: "Saving...",
  discard: "Discard",
  unsaved: "Unsaved",
  saveFailed: "The setting could not be saved; your edit was kept.",
  readOnly: "This deployment stores settings read-only.",
  show: "Show settings",
  hide: "Hide settings",
};

export const zh: Record<MtmConnectLocaleKey, string> = {
  title: "MTM Connect",
  description: "设备与执行世界连接前端。",
  enabled: "启用",
  enabledHint: "运行时加载固定版本的 Connect 前端。",
  reset: "恢复默认",
  statusDisabled: "已禁用",
  statusLoading: "加载中",
  statusEnabled: "就绪",
  statusFailed: "失败",
  open: "打开 Connect",
  save: "保存",
  saving: "保存中...",
  discard: "放弃修改",
  unsaved: "未保存",
  saveFailed: "设置保存失败，修改仍保留供你修正。",
  readOnly: "本部署的设置为只读。",
  show: "展开设置",
  hide: "收起设置",
};
