export type MtmCodingLocaleKey =
  | "nav"
  | "title"
  | "description"
  | "codebaseMemoryEnabled"
  | "codebaseMemoryEnabledHint"
  | "dynamicCanvasEnabled"
  | "dynamicCanvasEnabledHint"
  | "codebaseMemoryAugmentHooks"
  | "codebaseMemoryAugmentHooksHint"
  | "modernGoEnabled"
  | "modernGoEnabledHint"
  | "ponytailEnabled"
  | "ponytailEnabledHint"
  | "ponytailMode"
  | "ponytailModeHint"
  | "ponytailSubagents"
  | "ponytailSubagentsHint"
  | "rtkMode"
  | "rtkModeHint"
  | "rtkModeOff"
  | "rtkModeGuidance"
  | "rtkModeAuto"
  | "rtkModeRewrite"
  | "modeOff"
  | "modeLite"
  | "modeFull"
  | "modeUltra"
  | "overridden"
  | "reset"
  | "save"
  | "saving"
  | "discard"
  | "unsaved"
  | "saveFailed"
  | "readOnly"
  | "show"
  | "hide"
  | "updateTitle"
  | "updateHint"
  | "currentVersion"
  | "latestVersion"
  | "checkForUpdates"
  | "checkingForUpdates"
  | "updateNow"
  | "updatingPackage"
  | "updateAvailable"
  | "upToDate"
  | "updateComplete"
  | "restartRequired";

export const en: Record<MtmCodingLocaleKey, string> = {
  nav: "Coding",
  title: "MTM Coding",
  description: "Codebase Memory, Modern Go, Ponytail, and RTK coding assistance.",
  codebaseMemoryEnabled: "Codebase Memory",
  codebaseMemoryEnabledHint: "Expose graph-first code discovery tools and guidance.",
  dynamicCanvasEnabled: "Dynamic Canvas",
  dynamicCanvasEnabledHint: "Load the pinned Canvas extension at runtime from its published artifact.",
  codebaseMemoryAugmentHooks: "Codebase Memory context augmentation",
  codebaseMemoryAugmentHooksHint: "Add bounded repository context around session and read/search events.",
  modernGoEnabled: "Modern Go Guidelines",
  modernGoEnabledHint: "Use JetBrains Modern Go guidance when working on Go code.",
  ponytailEnabled: "Ponytail",
  ponytailEnabledHint: "Apply the lazy-senior-dev rules and managed editable skills.",
  ponytailMode: "Ponytail intensity",
  ponytailModeHint: "The default mode used for new agents; /ponytail can override one agent.",
  ponytailSubagents: "Apply Ponytail to subagents",
  ponytailSubagentsHint: "Carry coding rules and explicit skill commands into child agents.",
  rtkMode: "RTK mode",
  rtkModeHint: "Rewrite transparently when supported; otherwise use inline guidance.",
  rtkModeOff: "Off",
  rtkModeGuidance: "Guidance",
  rtkModeAuto: "Automatic fallback",
  rtkModeRewrite: "Transparent rewrite",
  modeOff: "Off",
  modeLite: "Lite",
  modeFull: "Full",
  modeUltra: "Ultra",
  overridden: "Overridden",
  reset: "Reset",
  save: "Save",
  saving: "Saving...",
  discard: "Discard",
  unsaved: "Unsaved",
  saveFailed: "The deployment rejected these values; your edits were kept.",
  readOnly: "This deployment stores settings read-only.",
  show: "Show settings",
  hide: "Hide settings",
  updateTitle: "mtmharness update",
  updateHint: "Check the stable npm release installed in this DSH Web profile. Updating requires a host restart.",
  currentVersion: "Current version",
  latestVersion: "Latest version",
  checkForUpdates: "Check for updates",
  checkingForUpdates: "Checking...",
  updateNow: "Update now",
  updatingPackage: "Updating...",
  updateAvailable: "A newer stable version is available.",
  upToDate: "This profile is up to date.",
  updateComplete: "Update installed.",
  restartRequired: "Restart DSH Web to load the update.",
};

export const zh: Record<MtmCodingLocaleKey, string> = {
  nav: "编程",
  title: "MTM 编程",
  description: "统一配置 Codebase Memory、Modern Go、Ponytail 与 RTK 编程辅助。",
  codebaseMemoryEnabled: "Codebase Memory",
  codebaseMemoryEnabledHint: "启用图谱优先的代码发现工具和指导。",
  dynamicCanvasEnabled: "动态画布",
  dynamicCanvasEnabledHint: "从已发布的固定版本载荷中运行时加载 Canvas 扩展。",
  codebaseMemoryAugmentHooks: "Codebase Memory 上下文增强",
  codebaseMemoryAugmentHooksHint: "在会话和读/搜索事件周围加入有边界的仓库上下文。",
  modernGoEnabled: "Modern Go Guidelines",
  modernGoEnabledHint: "编写 Go 代码时使用 JetBrains Modern Go 指导。",
  ponytailEnabled: "Ponytail",
  ponytailEnabledHint: "启用 lazy senior dev 规则和可编辑的托管 skills。",
  ponytailMode: "Ponytail 强度",
  ponytailModeHint: "新 agent 使用的默认模式；/ponytail 可以覆盖单个 agent。",
  ponytailSubagents: "对子 agent 启用 Ponytail",
  ponytailSubagentsHint: "将编程规则和显式 skill 命令传递给子 agent。",
  rtkMode: "RTK 模式",
  rtkModeHint: "在支持时透明重写；否则使用内联指导。",
  rtkModeOff: "关闭",
  rtkModeGuidance: "指导",
  rtkModeAuto: "自动降级",
  rtkModeRewrite: "透明重写",
  modeOff: "关闭",
  modeLite: "精简",
  modeFull: "完整",
  modeUltra: "极简",
  overridden: "已覆盖",
  reset: "恢复默认",
  save: "保存",
  saving: "保存中...",
  discard: "放弃修改",
  unsaved: "未保存",
  saveFailed: "本部署拒绝了这些值，修改仍保留供你修正。",
  readOnly: "本部署的设置为只读。",
  show: "展开设置",
  hide: "收起设置",
  updateTitle: "mtmharness 更新",
  updateHint: "检查此 DSH Web profile 中安装的稳定版 npm 包；更新后需要重启 Host。",
  currentVersion: "当前版本",
  latestVersion: "最新版本",
  checkForUpdates: "检查更新",
  checkingForUpdates: "检查中...",
  updateNow: "立即更新",
  updatingPackage: "更新中...",
  updateAvailable: "有新的稳定版可用。",
  upToDate: "此 profile 已是最新版本。",
  updateComplete: "更新已安装。",
  restartRequired: "请重启 DSH Web 以加载更新。",
};
