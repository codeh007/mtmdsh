import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "@deepseek-ai/cordis";
import type { SkillDefinition } from "@deepseek-ai/dsh-skill";

export const MODERN_GO_RESOURCE_BASE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../resources/go-modern-guidelines",
);

// Adapted from JetBrains/go-modern-guidelines v1.1.1; command paths are resolved for mtmharness.
const SKILL_CONTENT_TEMPLATE = [
  "# Modern Go Guidelines CLI",
  "",
  "Always write modern, idiomatic Go code. Use the Modern Go Guidelines CLI as the source of truth for modern Go idioms that may be newer than your knowledge cutoff.",
  "",
  "Command:",
  "",
  "- Linux or macOS: `__UNIX_COMMAND__`",
  "- Windows PowerShell: `__WINDOWS_COMMAND__`",
  "",
  "First run and approvals:",
  "",
  "On first use, the wrapper installs the Modern Go Guidelines CLI in a local cache directory.",
  "",
  "Subcommands:",
  "",
  "- `list`",
  "- `explain`",
  "",
  "Before editing Go code:",
  "",
  "1. Call the wrapper's `list` subcommand for the relevant Go file.",
  "",
  "   Prefer passing the file you are about to edit:",
  "",
  "   `__UNIX_COMMAND__ list --file-path path/to/file.go`",
  "",
  "   On Windows, use the PowerShell wrapper with the same arguments.",
  "",
  "   The CLI resolves the applicable Go version from `go.mod`, `go.work`, the local Go toolchain, or an explicit override.",
  "",
  "2. If the target Go version is already known, you may pass it directly:",
  "",
  "   `__UNIX_COMMAND__ list --go-version 1.24`",
  "",
  "3. Read the complete list output before deciding which guidelines apply.",
  "",
  "   The list output is ordered newest first. Read the full output because older supported guidelines may still apply.",
  "",
  "   Do not pipe the output through head, tail, grep, sed, or any other truncating/filtering command. Important guidelines may otherwise be missed.",
  "",
  "4. Treat returned guidelines as authoritative for modern Go style choices in code you are editing.",
  "",
  "   If a guideline applies, follow it even when nearby code or repository convention uses an older pattern. Skip it only when it would not compile, would change behavior, or clearly does not match the edited code. Before skipping a returned guideline that seems relevant, call the wrapper's `explain` subcommand for that guideline ID.",
  "",
  "Call `explain` only when a specific guideline may apply and you need the detailed explanation or examples. Request only the guideline IDs you intend to evaluate or apply:",
  "",
  "`__UNIX_COMMAND__ explain sync_waitgroup_go`",
  "",
  "Multiple guideline IDs may be requested as positional arguments:",
  "",
  "`__UNIX_COMMAND__ explain atomic_types errors_as_type`",
  "",
  "Do not call `explain` without guideline IDs. Use `list` first to discover the short guideline list for the target Go version, then call `explain` for the specific returned IDs.",
].join("\n");

function content(command: string): string {
  const configured = command.trim();
  const unixCommand = configured || "sh \"" + join(MODERN_GO_RESOURCE_BASE, "scripts", "run-tool.sh") + "\"";
  const windowsCommand = configured || "& '" + join(MODERN_GO_RESOURCE_BASE, "scripts", "run-tool.ps1") + "'";
  return SKILL_CONTENT_TEMPLATE
    .replaceAll("__UNIX_COMMAND__", unixCommand)
    .replaceAll("__WINDOWS_COMMAND__", windowsCommand);
}

/** Build the inline Modern Go skill and its package-owned wrapper resources. */
export function createModernGoSkill(command = ""): SkillDefinition {
  return {
    name: "use-modern-go",
    description: "Use the Modern Go Guidelines CLI whenever writing, modifying, fixing, or refactoring Go code. Apply its version-specific guidance to generated changes.",
    source: "runtime",
    provider: "mtm-coding",
    resourceBase: { kind: "directory", path: MODERN_GO_RESOURCE_BASE },
    invocation: { modelInvocable: true, userInvocable: true },
    content: content(command),
  };
}

/** Register the inline Modern Go skill without installing its CLI at startup. */
export function apply(ctx: Context, config: { command?: string } = {}): void {
  ctx.skills.register(createModernGoSkill(config.command));
}
