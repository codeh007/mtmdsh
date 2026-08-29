import type { Context } from "@deepseek-ai/cordis";
import { applyFileSkills } from "../../skill-files.js";

export type MtmCodingPackageKind = "data-only" | "runtime-backed";

export interface MtmCodingPackageManifest {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: "code" | "search" | "terminal";
  readonly kind: MtmCodingPackageKind;
  readonly skillRoot?: string;
  readonly skillNames: readonly string[];
  readonly prompt?: {
    readonly order: number;
    readonly text: string;
  };
}

/** Trusted package metadata; mutable enabled state remains in mtm-coding settings. */
export const MTM_CODING_PACKAGES = {
  codebaseMemory: {
    id: "codebase-memory",
    label: "Codebase Memory",
    description: "Graph-first code discovery and repository context.",
    icon: "search",
    kind: "runtime-backed",
    skillNames: [],
  },
  modernGo: {
    id: "modern-go",
    label: "Modern Go Guidelines",
    description: "Version-specific guidance for modern Go code.",
    icon: "code",
    kind: "data-only",
    skillRoot: "use-modern-go",
    skillNames: ["use-modern-go"],
  },
  ponytail: {
    id: "ponytail",
    label: "Ponytail",
    description: "Minimal coding rules and over-engineering reviews.",
    icon: "code",
    kind: "runtime-backed",
    skillRoot: "ponytail",
    skillNames: [
      "ponytail",
      "ponytail-review",
      "ponytail-audit",
      "ponytail-debt",
      "ponytail-gain",
      "ponytail-help",
    ],
  },
  rtk: {
    id: "rtk",
    label: "RTK",
    description: "Reduced shell output with transparent Bash rewriting.",
    icon: "terminal",
    kind: "runtime-backed",
    skillRoot: "rtk",
    skillNames: ["rtk"],
    prompt: {
      order: 109,
      text: "RTK only concerns Bash shell commands. DSH read, grep, glob, PowerShell, and persistent terminal calls are not covered by this integration.\nRTK failures and unsupported commands pass through; RTK_DISABLED=1 disables one command.",
    },
  },
} as const satisfies Record<string, MtmCodingPackageManifest>;

/** Mount one package's file-backed skills and static prompt, if declared. */
export function applyManifestPackage(ctx: Context, packageManifest: MtmCodingPackageManifest): void {
  if (packageManifest.skillRoot !== undefined) {
    applyFileSkills(ctx, "mtm-coding-" + packageManifest.id, packageManifest.skillRoot);
  }
  if (packageManifest.prompt !== undefined) {
    ctx.systemPrompt.section({
      name: "mtm-coding:" + packageManifest.id + ":prompt",
      order: packageManifest.prompt.order,
      text: packageManifest.prompt.text,
    });
  }
}
