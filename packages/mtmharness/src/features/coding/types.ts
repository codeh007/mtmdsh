import z from "@deepseek-ai/schemastery";
import type { ReconnectConfig } from "@deepseek-ai/dsh-mcp-client";

export type PonytailMode = "off" | "lite" | "full" | "ultra";
export type RtkMode = "off" | "guidance" | "auto" | "rewrite";

export interface MtmCodingSettings {
  codebaseMemoryEnabled: boolean;
  dynamicCanvasEnabled: boolean;
  codebaseMemoryAugmentHooks: boolean;
  modernGoEnabled: boolean;
  ponytailEnabled: boolean;
  ponytailMode: PonytailMode;
  ponytailSubagents: boolean;
  rtkMode: RtkMode;
  serverName: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cacheDir: string;
  allowedRoot: string;
  toolCallTimeoutMs: number;
  hookTimeoutMs: number;
  failOnStartupError: boolean;
  reconnect: ReconnectConfig;
}

export type MtmCodingConfig = Partial<MtmCodingSettings>;

const MAX_TIMER_DELAY_MS = 2_147_483_647;

const Reconnect = z.object({
  enabled: z.boolean().default(true),
  initialDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(500),
  maxDelayMs: z.number().min(1).max(MAX_TIMER_DELAY_MS).default(30_000),
  maxAttempts: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(10),
});

export const MtmCodingSettingsSchema: z<MtmCodingSettings> = z.object({
  codebaseMemoryEnabled: z.boolean().default(true),
  dynamicCanvasEnabled: z.boolean().default(false),
  codebaseMemoryAugmentHooks: z.boolean().default(true),
  modernGoEnabled: z.boolean().default(true),
  ponytailEnabled: z.boolean().default(true),
  ponytailMode: z.union(["off", "lite", "full", "ultra"] as const).default("full"),
  ponytailSubagents: z.boolean().default(true),
  rtkMode: z.union(["off", "guidance", "auto", "rewrite"] as const).default("auto"),
  serverName: z.string().default("codebase_memory"),
  command: z.string().default(""),
  args: z.array(String).default([]),
  cwd: z.string().default(""),
  env: z.dict(String).default({}),
  cacheDir: z.string().default(""),
  allowedRoot: z.string().default(""),
  toolCallTimeoutMs: z.number().default(60_000),
  hookTimeoutMs: z.number().default(2_000),
  failOnStartupError: z.boolean().default(false),
  reconnect: Reconnect,
});

export function codebaseMemoryConfig(settings: MtmCodingSettings): Record<string, unknown> {
  return {
    serverName: settings.serverName,
    command: settings.command,
    args: settings.args,
    cwd: settings.cwd,
    env: settings.env,
    cacheDir: settings.cacheDir,
    allowedRoot: settings.allowedRoot,
    toolCallTimeoutMs: settings.toolCallTimeoutMs,
    hookTimeoutMs: settings.hookTimeoutMs,
    augmentHooks: settings.codebaseMemoryAugmentHooks,
    failOnStartupError: settings.failOnStartupError,
    reconnect: settings.reconnect,
  };
}
