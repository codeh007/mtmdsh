import type { Context } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { AssembleContext } from "@deepseek-ai/dsh-system-prompt";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import { applyManifestPackage, MTM_CODING_PACKAGES } from "./manifest.js";
import type { RtkMode } from "./types.js";

export const name = "mtm-coding-rtk";
export const inject = ["systemPrompt", "commands"];

export type RtkStatus = "disabled" | "guidance" | "unavailable";

const pluginSource = { kind: "plugin" as const, plugin: name };

function statusText(status: RtkStatus): string {
  switch (status) {
    case "guidance": return "RTK guidance is active; use an explicitly invoked RTK command when the executable is available.";
    case "unavailable": return "RTK transparent rewrite is unavailable in this DSH runtime; tool arguments remain unchanged.";
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
  ].join("\n");
}

/** Mount RTK guidance using the current DSH ToolRuntime contract. */
export async function apply(ctx: Context, config: { mode?: RtkMode } = {}): Promise<void> {
  const requested = config.mode ?? "auto";
  if (requested === "off") return;
  await applyManifestPackage(ctx, MTM_CODING_PACKAGES.rtk);
  const status: RtkStatus = requested === "rewrite" ? "unavailable" : "guidance";
  ctx.systemPrompt.section({
    name: "mtm-coding:rtk:status",
    order: 109.1,
    text: (_assembly: AssembleContext) => prompt(status),
  });
  ctx.commands.register({
    name: "rtk",
    description: "show RTK integration status",
    handler: (invocation): CommandResult => {
      if (invocation.rawInput.trim() === "") return result(statusText(status));
      return { kind: "error", text: "Use /rtk for status." };
    },
  });
  ctx.on("agent/session-start", ({ agent }) => {
    agent.inject(notice(status));
  });
}
