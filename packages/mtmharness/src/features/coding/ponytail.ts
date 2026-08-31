import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { AssembleContext } from "@deepseek-ai/dsh-system-prompt";
import type { SkillDefinition } from "@deepseek-ai/dsh-skill";
import type { CommandResult } from "@deepseek-ai/dsh-commands";
import { applyManifestPackage, MTM_CODING_PACKAGES } from "./manifest.js";
import type { PonytailMode } from "./types.js";

export const name = "mtm-coding-ponytail";
export const inject = ["systemPrompt", "skills", "commands"];

const MODE_NAMES = new Set<PonytailMode>(["off", "lite", "full", "ultra"]);

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

async function loadCoreSkill(ctx: Context): Promise<SkillDefinition | undefined> {
  try {
    return await ctx.skills.get("ponytail");
  } catch (error) {
    ctx.logger.warn("mtm-coding: Ponytail skill document unavailable: " + String(error));
    return undefined;
  }
}

function result(text: string): CommandResult {
  return { kind: "success", text };
}

/** Mount Ponytail rules, externally managed skills, and intensity control. */
export async function apply(ctx: Context, config: {
  mode?: PonytailMode;
  applyToSubagents?: boolean;
} = {}): Promise<void> {
  if (!await applyManifestPackage(ctx, MTM_CODING_PACKAGES.ponytail)) return;
  const defaultMode = normalizeMode(config.mode);
  const applyToSubagents = config.applyToSubagents ?? true;
  const states = new WeakMap<Agent, PonytailMode>();
  let coreSkill = await loadCoreSkill(ctx);
  let active = true;
  let refreshing = Promise.resolve();

  ctx.on("skills/change", () => {
    refreshing = refreshing.then(async () => {
      const next = await loadCoreSkill(ctx);
      if (active && next !== undefined) coreSkill = next;
    });
  });
  ctx.effect(() => async () => {
    active = false;
    await refreshing;
  }, "mtm-coding.ponytail-skill-refresh");

  ctx.systemPrompt.section({
    name: "mtm-coding:ponytail",
    order: 90,
    text: (assembly: AssembleContext) => {
      const agent = (assembly as AssembleContext & { agent?: Agent }).agent;
      if (!applyToSubagents && agent?.session.header.origin === "subagent") return "";
      const mode = modeForAgent(states, agent, defaultMode);
      if (mode === "off" || coreSkill === undefined) return "";
      return instructions(coreSkill, mode);
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
}
