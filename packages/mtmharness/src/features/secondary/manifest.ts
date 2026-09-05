/** Trusted runtime metadata for mtmharness frontend extensions. */
export interface MtmSecondaryExtensionManifest {
  /** Version of the mtmharness frontend extension ABI. */
  readonly apiVersion: 1;
  /** Stable extension identifier. */
  readonly id: string;
  /** Exact extension release version. */
  readonly version: string;
  /** Exact browser artifact URL. */
  readonly clientUrl: string;
  /** Native Subresource Integrity value for the browser artifact. */
  readonly clientIntegrity: string;
}

const ID = /^[a-z][a-z0-9._-]{0,63}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const INTEGRITY = /^sha256-[A-Za-z0-9+/]{43}=$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertArtifactUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("secondary client URL must be an exact HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("secondary client URL must be an exact HTTPS URL");
  }
}

/** Validate trusted, administrator-controlled metadata before browser loading. */
export function assertSecondaryManifest(value: unknown): asserts value is MtmSecondaryExtensionManifest {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.version !== "string" || typeof value.clientUrl !== "string" || typeof value.clientIntegrity !== "string") {
    throw new Error("secondary extension manifest is invalid");
  }
  if (value.apiVersion !== 1) throw new Error("secondary extension API version is unsupported");
  if (!ID.test(value.id)) throw new Error("secondary extension id is invalid");
  if (!VERSION.test(value.version) || value.version.includes("latest")) throw new Error("secondary extension version must be pinned");
  if (!INTEGRITY.test(value.clientIntegrity)) throw new Error("secondary extension integrity must be sha256");
  assertArtifactUrl(value.clientUrl);
}

/** The published Canvas artifact used by the first secondary extension experiment. */
export const MTM_CANVAS_EXTENSION = {
  apiVersion: 1,
  id: "mtmcanvas",
  version: "0.2.0",
  clientUrl: "https://unpkg.com/mtmcanvas@0.2.0/lib/client.js",
  clientIntegrity: "sha256-TDJa0tdb9LK87hCigE0aruLJnuNqRG7Ls2UfuHWsKU4=",
} as const satisfies MtmSecondaryExtensionManifest;

/** The published mock Connect artifact used by the first device UI release. */
export const MTM_CONNECT_EXTENSION = {
  apiVersion: 1,
  id: "mtm-connect",
  version: "0.2.0",
  clientUrl: "https://unpkg.com/mtm-connect@0.2.0/lib/client.js",
  clientIntegrity: "sha256-DS/tRWnWzx1IqccuJApF8IVgh5lv9fhP1CyNQUI+nCw=",
} as const satisfies MtmSecondaryExtensionManifest;

/** The published token-free Admin launcher for the independent control plane. */
export const MTM_ADMIN_EXTENSION = {
  apiVersion: 1,
  id: "mtm-admin",
  version: "0.1.1",
  clientUrl: "https://unpkg.com/mtm-admin@0.1.1/lib/client.js",
  clientIntegrity: "sha256-ZwCnujnLE7LsUBlgn1CQpZAQx2NgjZG1iOfUoQHdC74=",
} as const satisfies MtmSecondaryExtensionManifest;
