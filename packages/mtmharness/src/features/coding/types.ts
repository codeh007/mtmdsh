import z from "@deepseek-ai/schemastery";
import type { ReconnectConfig } from "@deepseek-ai/dsh-mcp-client";

export type PonytailMode = "off" | "lite" | "full" | "ultra";
export type RtkMode = "off" | "guidance" | "auto" | "rewrite";

export interface MtmCodingSettings {
  codebaseMemoryEnabled: boolean;
  codebaseMemoryAugmentHooks: boolean;
  ponytailEnabled: boolean;
  ponytailMode: PonytailMode;
  ponytailSubagents: boolean;
  rtkMode: RtkMode;
  rtkAutoInstall: boolean;
  rtkCommand: string;
  serverName: string;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  cacheDir: string;
  allowedRoot: string;
  toolCallTimeoutMs: number;
  hookTimeoutMs: number;
  runtimeCheckTimeoutMs: number;
  ensureRuntime: boolean;
  failOnStartupError: boolean;
  reconnect: ReconnectConfig;
}

export type MtmCodingConfig = Partial<MtmCodingSettings>;

const Reconnect = z.object({
  enabled: z.boolean().default(true),
  initialDelayMs: z.number().default(500),
  maxDelayMs: z.number().default(30_000),
  maxAttempts: z.number().default(10),
});

export const MtmCodingSettingsSchema: z<MtmCodingSettings> = z.object({
  codebaseMemoryEnabled: z.boolean().default(true),
  codebaseMemoryAugmentHooks: z.boolean().default(true),
  ponytailEnabled: z.boolean().default(true),
  ponytailMode: z.union(["off", "lite", "full", "ultra"] as const).default("full"),
  ponytailSubagents: z.boolean().default(true),
  rtkMode: z.union(["off", "guidance", "auto", "rewrite"] as const).default("auto"),
  rtkAutoInstall: z.boolean().default(true),
  rtkCommand: z.string().default(""),
  serverName: z.string().default("codebase_memory"),
  command: z.string().default(""),
  args: z.array(String).default([]),
  cwd: z.string().default(""),
  env: z.dict(String).default({}),
  cacheDir: z.string().default(""),
  allowedRoot: z.string().default(""),
  toolCallTimeoutMs: z.number().default(60_000),
  hookTimeoutMs: z.number().default(2_000),
  runtimeCheckTimeoutMs: z.number().default(120_000),
  ensureRuntime: z.boolean().default(true),
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
    runtimeCheckTimeoutMs: settings.runtimeCheckTimeoutMs,
    ensureRuntime: settings.ensureRuntime,
    augmentHooks: settings.codebaseMemoryAugmentHooks,
    failOnStartupError: settings.failOnStartupError,
    reconnect: settings.reconnect,
  };
}
