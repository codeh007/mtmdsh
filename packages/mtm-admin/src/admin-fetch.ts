import type { AdminAuthClient } from "./config";
import { normalizeAdminOrigin } from "./config";

type AdminRuntime = {
  apiOrigin: string;
  auth: AdminAuthClient;
  tokenSource: Pick<AdminAuthClient, "getAccessToken" | "clear">;
};

let runtime: AdminRuntime | undefined;

export function configureAdminApp(config: { apiOrigin: string; auth: AdminAuthClient; tokenSource?: Pick<AdminAuthClient, "getAccessToken" | "clear"> }): void {
  runtime = {
    apiOrigin: normalizeAdminOrigin(config.apiOrigin),
    auth: config.auth,
    tokenSource: config.tokenSource ?? config.auth,
  };
}

export function clearAdminApp(auth: AdminAuthClient): void {
  if (runtime?.auth === auth) runtime = undefined;
}

export function adminAuth(): AdminAuthClient | undefined {
  return runtime?.auth;
}

export function adminOrigin(): string {
  if (runtime === undefined) throw new Error("mtm-admin is not configured");
  return runtime.apiOrigin;
}

export function adminUrl(path: string): string {
  return new URL(path, adminOrigin()).toString();
}

export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const current = runtime;
  if (current === undefined) throw new Error("mtm-admin is not configured");
  const token = await current.tokenSource.getAccessToken();
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer " + token);
  const response = await fetch(adminUrl(path), { ...init, credentials: "omit", headers });
  if (response.status === 401) current.tokenSource.clear();
  return response;
}
