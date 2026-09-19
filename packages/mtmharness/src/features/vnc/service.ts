import type { MtmP2pClient } from "../p2p/client.js";

export interface VncDescription {
  type: "vnc";
  version: 1;
  instance: "desktop";
  generation?: string;
  state:
    | "startable"
    | "starting"
    | "ready"
    | "stopping"
    | "failed"
    | "unavailable";
  authentication: "none";
  carriers: string[];
}

export async function confirmVnc(
  client: MtmP2pClient,
  peer: string,
  signal: AbortSignal,
  action?: "start" | "stop",
): Promise<VncDescription> {
  const response = await client.request(
    peer,
    action === undefined ? "/api/vnc" : `/api/vnc/${action}`,
    {
      method: action === undefined ? "GET" : "POST",
      signal,
    },
    action === "start" ? 300_000 : undefined,
  );
  if (response.status === 404)
    throw new Error("This node does not provide a desktop service.");
  if (response.status === 401 || response.status === 403)
    throw new Error("This desktop requires authorization.");
  if (response.status === 409)
    throw new Error(
      "This desktop is managed outside this node and cannot be stopped here.",
    );
  if (!response.ok) {
    const problem: unknown = await response.json().catch(() => null);
    if (
      problem &&
      typeof problem === "object" &&
      "error" in problem &&
      typeof problem.error === "string"
    ) {
      throw new Error(problem.error.slice(0, 1024));
    }
    throw new Error(`Desktop service failed (${response.status}).`);
  }
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid desktop service response.");
  const desc = value as Record<string, unknown>;
  if (desc.type !== "vnc" || desc.version !== 1 || desc.instance !== "desktop")
    throw new Error("Incompatible desktop service version or instance.");
  if (desc.authentication !== "none")
    throw new Error(
      "This desktop requires an unsupported authorization method.",
    );
  if (
    !Array.isArray(desc.carriers) ||
    !desc.carriers.every((item: unknown) => typeof item === "string") ||
    ![
      "startable",
      "starting",
      "ready",
      "stopping",
      "failed",
      "unavailable",
    ].includes(String(desc.state)) ||
    (desc.state === "ready" &&
      (typeof desc.generation !== "string" ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(desc.generation)))
  ) {
    throw new Error("Invalid desktop service state.");
  }
  return value as VncDescription;
}
