import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import type { AssembleContext } from "@deepseek-ai/dsh-system-prompt";
import { renderSkillContent } from "@deepseek-ai/dsh-skill";
import type { SkillDefinition } from "@deepseek-ai/dsh-skill";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import { readSkillContent } from "../../skill-files.js";
import { applyManifestPackage, MTM_CODING_PACKAGES } from "./manifest.js";
import type { PonytailMode } from "./types.js";

export const name = "mtm-coding-ponytail";
export const inject = ["systemPrompt", "skills", "commands"];

const SKILL_NAMES = MTM_CODING_PACKAGES.ponytail.skillNames;

const MODE_NAMES = new Set<PonytailMode>(["off", "lite", "full", "ultra"]);
const pluginSource = { kind: "plugin" as const, plugin: name };

function normalizeMode(value: unknown): PonytailMode {
  return typeof value === "string" && MODE_NAMES.has(value as PonytailMode)
    ? value as PonytailMode
    : "full";
}

function filterSkillBodyForMode(body: string, mode: PonytailMode): string {
  const effectiveMode = normalizeMode(mode);
  return body.split(/\r?\n/u).filter((line) => {
    const table = /^\|\s*\*\*(.+?)\*\*\s*\|/u.exec(line);
    if (table !== null && MODE_NAMES.has(table[1] as PonytailMode)) return table[1] === effectiveMode;
    const example = /^-\s*([^:]+):\s*"/u.exec(line);
    if (example !== null && MODE_NAMES.has(example[1] as PonytailMode)) return example[1] === effectiveMode;
    return true;
  }).join("\n");
}

function instructions(skill: Pick<SkillDefinition, "name" | "content">, mode: PonytailMode): string {
  return [
    "PONYTAIL MODE ACTIVE - level: " + mode,
    filterSkillBodyForMode(skill.content, mode),
  ].join("\n\n");
}

function modeForAgent(states: WeakMap<Agent, PonytailMode>, agent: Agent | undefined, fallback: PonytailMode): PonytailMode {
  return agent === undefined ? fallback : states.get(agent) ?? fallback;
}

function coreSkillContent(ctx: Context): string | undefined {
  try {
    return readSkillContent("ponytail");
  } catch (error) {
    ctx.logger.warn("mtm-coding: Ponytail skill document unavailable: " + String(error));
    return undefined;
  }
}

function skillMessage(skill: SkillDefinition): ReturnType<typeof createUserMessage> {
  return createUserMessage({
    content: [{ type: "text", text: renderSkillContent(skill) }],
    source: { ...pluginSource, form: "notice", summary: "Loaded " + skill.name },
  });
}

function result(text: string): CommandResult {
  return { kind: "success", text };
}

/** Mount Ponytail rules, file-backed skills, and human commands. */
export function apply(ctx: Context, config: {
  mode?: PonytailMode;
  applyToSubagents?: boolean;
} = {}): void {
  applyManifestPackage(ctx, MTM_CODING_PACKAGES.ponytail);
  const defaultMode = normalizeMode(config.mode);
  const applyToSubagents = config.applyToSubagents ?? true;
  const states = new WeakMap<Agent, PonytailMode>();

  ctx.systemPrompt.section({
    name: "mtm-coding:ponytail",
    order: 90,
    text: (assembly: AssembleContext) => {
      const agent = (assembly as AssembleContext & { agent?: Agent }).agent;
      if (!applyToSubagents && agent?.session.header.origin === "subagent") return "";
      const mode = modeForAgent(states, agent, defaultMode);
      if (mode === "off") return "";
      const content = coreSkillContent(ctx);
      return content === undefined ? "" : instructions({ name: "ponytail", content }, mode);
    },
  });

  ctx.on("agent/session-start", ({ agent }) => {
    states.set(agent, defaultMode);
  });

  ctx.commands.register({
    name: "ponytail",
    description: "show or switch Ponytail intensity for this agent",
    input: { hint: "[lite|full|ultra|off]" },
    handler: (invocation): CommandResult => {
      const raw = invocation.rawInput.trim();
      if (raw === "") return result("Ponytail mode: " + modeForAgent(states, invocation.agent, defaultMode));
      if (!MODE_NAMES.has(raw as PonytailMode)) {
        return { kind: "error", text: "Use /ponytail lite, /ponytail full, /ponytail ultra, or /ponytail off." };
      }
      const next = raw as PonytailMode;
      states.set(invocation.agent, next);
      return result("Ponytail mode: " + next);
    },
  });

  for (const skillName of SKILL_NAMES.slice(1)) {
    ctx.commands.register({
      name: skillName,
      description: "load the " + skillName + " Ponytail skill for this agent",
      handler: async (invocation): Promise<CommandResult> => {
        if (!applyToSubagents && invocation.agent.session.header.origin === "subagent") {
          return result(skillName + " is disabled for subagents.");
        }
        const skill = await ctx.skills.get(skillName, {
          cwd: invocation.agent.session.header.cwd,
          signal: invocation.signal,
          scope: invocation.agent,
        });
        if (skill === undefined) return { kind: "error", text: skillName + " is unavailable." };
        invocation.agent.inject(skillMessage(skill));
        return result("Loaded " + skillName + ".");
      },
    });
  }
}
