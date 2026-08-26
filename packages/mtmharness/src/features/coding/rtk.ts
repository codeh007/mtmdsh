import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { AssembleContext } from "@deepseek-ai/dsh-system-prompt";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import { renderSkillContent, type SkillDefinition } from "@deepseek-ai/dsh-skill";
import type {} from "@deepseek-ai/dsh-tools";
import { RTK_SKILL } from "./rtk-skill.js";
import { resolveWorkingDirectory } from "./runtime.js";
import { bashInput, ensureRtk, rewriteRtk, rtkDisabled, type RtkRuntimeOptions } from "./rtk-runtime.js";
import type { RtkMode } from "./types.js";

export const name = "mtm-coding-rtk";
export const inject = ["systemPrompt", "skills", "commands"];

export type RtkStatus = "disabled" | "guidance" | "rewrite" | "unavailable";

type RecordCandidate = {
  readonly name: string;
  readonly arguments: unknown;
  readonly agent?: Agent;
  readonly signal: AbortSignal;
};

type RecordDecision =
  | { readonly kind: "unchanged" }
  | { readonly kind: "rewrite"; readonly arguments: unknown };

type RecordListener = (candidate: RecordCandidate, next: () => Promise<RecordDecision>) => Promise<RecordDecision>;
type RtkContext = Context & {
  readonly get?: (key: string) => unknown;
  readonly tools?: { readonly resolveRecordInput?: unknown; readonly get?: (name: string, agent?: Agent) => unknown };
  readonly subprocess?: unknown;
};

const pluginSource = { kind: "plugin" as const, plugin: name };

function service(ctx: Context, key: string): unknown {
  const candidate = ctx as RtkContext;
  return typeof candidate.get === "function" ? candidate.get(key) : candidate[key as "tools" | "subprocess"];
}

function hasPreRecordCapability(ctx: Context): boolean {
  return typeof (service(ctx, "tools") as RtkContext["tools"] | undefined)?.resolveRecordInput === "function";
}

function hasSubprocessCapability(ctx: Context): boolean {
  return service(ctx, "subprocess") !== undefined;
}

function hasBashTool(ctx: Context, agent?: Agent): boolean {
  const tools = service(ctx, "tools") as RtkContext["tools"] | undefined;
  return typeof tools?.get === "function" && tools.get("bash", agent) !== undefined;
}

function statusText(status: RtkStatus): string {
  switch (status) {
    case "guidance": return "RTK guidance is active; explicit rtk-prefixed Bash commands are available.";
    case "rewrite": return "RTK transparent rewrite is active for Bash tool calls; DSH policy still decides the effective call.";
    case "unavailable": return "RTK transparent rewrite is unavailable in this DSH runtime; explicit rtk-prefixed Bash commands remain available.";
    case "disabled": return "RTK is disabled.";
  }
}

function notice(status: RtkStatus): ReturnType<typeof createUserMessage> {
  return createUserMessage({
    content: [{ type: "text", text: statusText(status) }],
    source: { ...pluginSource, form: "notice", summary: "RTK status: " + status },
  });
}

function result(text: string): CommandResult {
  return { kind: "success", text };
}

function prompt(status: RtkStatus): string {
  return [
    "RTK STATUS: " + status,
    statusText(status),
    "RTK only concerns Bash shell commands. DSH read, grep, glob, PowerShell, and persistent terminal calls are not covered by this integration.",
    "RTK failures and unsupported commands pass through; RTK_DISABLED=1 disables one command.",
  ].join("\n");
}

function skillMessage(skill: SkillDefinition): ReturnType<typeof createUserMessage> {
  return createUserMessage({
    content: [{ type: "text", text: renderSkillContent(skill) }],
    source: { ...pluginSource, form: "notice", summary: "Loaded " + skill.name },
  });
}

/** Mount RTK's embedded guidance and, when supported, the pre-record rewrite listener. */
export function apply(ctx: Context, config: {
  mode?: RtkMode;
  autoInstall?: boolean;
  command?: string;
} = {}): void {
  const requested = config.mode ?? "auto";
  if (requested === "off") return;
  const transparentCapability = hasPreRecordCapability(ctx) && hasSubprocessCapability(ctx);
  const transparent = (requested === "auto" || requested === "rewrite") && transparentCapability;
  const status: RtkStatus = requested === "rewrite"
    ? (transparent ? "rewrite" : "unavailable")
    : transparent ? "rewrite" : "guidance";
  const skill: SkillDefinition = {
    ...RTK_SKILL,
    source: "runtime",
    provider: "mtm-coding",
    invocation: { modelInvocable: true, userInvocable: true },
  };
  ctx.skills.register(skill);
  ctx.systemPrompt.section({
    name: "mtm-coding:rtk",
    order: 109,
    text: (_assembly: AssembleContext) => prompt(status),
  });
  ctx.commands.register({
    name: "rtk",
    description: "show RTK integration status",
    input: { hint: "[skill]" },
    handler: (invocation): CommandResult => {
      if (invocation.rawInput.trim() === "") return result(statusText(status));
      if (invocation.rawInput.trim() === "skill") {
        invocation.agent.inject(skillMessage(skill));
        return result("Loaded rtk.");
      }
      return { kind: "error", text: "Use /rtk for status or /rtk skill for the inline RTK guidance." };
    },
  });
  ctx.on("agent/session-start", ({ agent }) => {
    agent.inject(notice(status));
  });
  if (!transparent) return;

  const options: RtkRuntimeOptions = {
    command: config.command,
    autoInstall: config.autoInstall,
  };
  const resolveRuntime = (input: { cwd?: string; signal?: AbortSignal }): Promise<{ command: string; home: string; env: Record<string, string> }> =>
    ensureRtk(ctx, { ...options, cwd: input.cwd, signal: input.signal });
  const register = ctx.on as unknown as (event: string, listener: RecordListener) => unknown;
  register("tools/pre-record-input", async (candidate, next) => {
    const downstream = await next();
    if (candidate.name !== "bash" || downstream.kind !== "unchanged") return downstream;
    const input = bashInput(candidate.arguments);
    if (input === undefined || !hasBashTool(ctx, candidate.agent) || rtkDisabled(input.command) || /^rtk(?:\s|$)/.test(input.command.trim())) return downstream;
    try {
      const cwd = resolveWorkingDirectory(input.cwd, candidate.agent?.session.header.cwd);
      const runtimeInfo = await resolveRuntime({ cwd, signal: candidate.signal });
      const rewritten = await rewriteRtk(
        ctx,
        runtimeInfo.command,
        input.command,
        cwd,
        runtimeInfo.env,
        candidate.signal,
      );
      if (rewritten === undefined) return downstream;
      return { kind: "rewrite", arguments: { ...(candidate.arguments as Record<string, unknown>), command: rewritten.command } };
    } catch (error) {
      candidate.signal.throwIfAborted();
      // Availability is capability state; one failed rewrite remains fail-open and retryable.
      ctx.logger.warn("mtm-coding RTK rewrite failed; original command retained: " + String(error));
      return downstream;
    }
  });
}
