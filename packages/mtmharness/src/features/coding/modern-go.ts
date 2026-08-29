import type { Context } from "@deepseek-ai/cordis";
import type { SkillDefinition } from "@deepseek-ai/dsh-skill";

// Adapted from JetBrains/go-modern-guidelines CLI v0.1.1 (Apache-2.0).
const SKILL_CONTENT_TEMPLATE = [
  "# Modern Go Guidelines CLI",
  "",
  "Always write modern, idiomatic Go code. Use the Modern Go Guidelines CLI as the source of truth for modern Go idioms that may be newer than your knowledge cutoff.",
  "",
  "Command:",
  "",
  "- Linux, macOS, and Windows: `go run github.com/JetBrains/go-modern-guidelines@v0.1.1`",
  "",
  "First run and approvals:",
  "",
  "On first use, Go downloads and builds the pinned Modern Go Guidelines module in the Go module cache.",
  "",
  "Subcommands:",
  "",
  "- `list`",
  "- `explain`",
  "",
  "Before editing Go code:",
  "",
  "1. Run the command's `list` subcommand for the relevant Go file.",
  "",
  "   Prefer passing the file you are about to edit:",
  "",
  "   `go run github.com/JetBrains/go-modern-guidelines@v0.1.1 list --file-path path/to/file.go`",
  "",
  "   Use the same command on Windows PowerShell.",
  "",
  "   The CLI resolves the applicable Go version from `go.mod`, `go.work`, the local Go toolchain, or an explicit override.",
  "",
  "2. If the target Go version is already known, you may pass it directly:",
  "",
  "   `go run github.com/JetBrains/go-modern-guidelines@v0.1.1 list --go-version 1.24`",
  "",
  "3. Read the complete list output before deciding which guidelines apply.",
  "",
  "   The list output is ordered newest first. Read the full output because older supported guidelines may still apply.",
  "",
  "   Do not pipe the output through head, tail, grep, sed, or any other truncating/filtering command. Important guidelines may otherwise be missed.",
  "",
  "4. Treat returned guidelines as authoritative for modern Go style choices in code you are editing.",
  "",
  "   If a guideline applies, follow it even when nearby code or repository convention uses an older pattern. Skip it only when it would not compile, would change behavior, or clearly does not match the edited code. Before skipping a returned guideline that seems relevant, call the CLI's `explain` subcommand for that guideline ID.",
  "",
  "Call `explain` only when a specific guideline may apply and you need the detailed explanation or examples. Request only the guideline IDs you intend to evaluate or apply:",
  "",
  "`go run github.com/JetBrains/go-modern-guidelines@v0.1.1 explain sync_waitgroup_go`",
  "",
  "Multiple guideline IDs may be requested as positional arguments:",
  "",
  "`go run github.com/JetBrains/go-modern-guidelines@v0.1.1 explain atomic_types errors_as_type`",
  "",
  "Do not call `explain` without guideline IDs. Use `list` first to discover the short guideline list for the target Go version, then call `explain` for the specific returned IDs.",
].join("\n");

/** Build the inline Modern Go skill. */
export function createModernGoSkill(): SkillDefinition {
  return {
    name: "use-modern-go",
    description: "Use the Modern Go Guidelines CLI whenever writing, modifying, fixing, or refactoring Go code. Apply its version-specific guidance to generated changes.",
    source: "runtime",
    provider: "mtm-coding",
    invocation: { modelInvocable: true, userInvocable: true },
    content: SKILL_CONTENT_TEMPLATE,
  };
}

/** Register the inline Modern Go skill without installing its CLI at startup. */
export function apply(ctx: Context): void {
  ctx.skills.register(createModernGoSkill());
}
