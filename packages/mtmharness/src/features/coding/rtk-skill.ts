export const RTK_SKILL = {
  name: "rtk",
  description: "Use RTK to reduce noisy shell output when the runtime reports it is available.",
  content: [
    "# RTK",
    "",
    "RTK is an optional shell-output reducer. Its runtime status is authoritative:",
    "- In guidance mode, explicitly prefix supported Bash commands with \"rtk\" when useful, for example \"rtk git status\" or \"rtk pytest\".",
    "- In transparent rewrite mode, the runtime rewrites Bash input before the call is recorded and executed; do not add a second manual RTK prefix.",
    "- RTK applies to Bash commands only. DSH read, grep, glob, PowerShell, and persistent terminal inputs are not implied to be rewritten.",
    "- Unsupported commands and RTK failures pass through unchanged.",
    "- RTK_DISABLED=1 disables RTK for one command.",
    "- Never run rtk init: it changes host configuration. Use rtk gain, rtk discover, or rtk proxy only when the user asks for those RTK features.",
  ].join("\n"),
} as const;
