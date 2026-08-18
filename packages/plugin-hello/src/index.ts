import type { Context } from "@deepseek-ai/cordis";

export const name = "mtmdsh-hello";

export interface Config {
  message?: string;
}

export function apply(_ctx: Context, config: Config = {}): void {
  console.log(config.message ?? "Hello from mtmdsh.");
}
