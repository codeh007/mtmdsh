#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const libRoot = resolve(packageRoot, "lib");
const distRoot = resolve(packageRoot, "dist");
const tsc = resolve(packageRoot, "node_modules/.bin/tsc");
const vite = resolve(packageRoot, "node_modules/.bin/vite");
const clientTemp = resolve(libRoot, "client.bundle.cjs");
const packageName = "mtmharness";
const workspaceRoot = resolve(packageRoot, "..");

rmSync(libRoot, { recursive: true, force: true });
rmSync(distRoot, { recursive: true, force: true });
mkdirSync(libRoot, { recursive: true });
if (!existsSync(tsc) || !existsSync(vite)) throw new Error("mtmharness build: local TypeScript and Vite executables are required");

execFileSync("pnpm", ["--filter", "mtmcanvas", "run", "build"], { cwd: workspaceRoot, stdio: "inherit" });
execFileSync(tsc, ["--project", resolve(packageRoot, "tsconfig.json")], { cwd: packageRoot, stdio: "inherit" });

await build({
  entryPoints: [resolve(packageRoot, "src/index.ts")],
  outfile: resolve(libRoot, "index.js"),
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external",
  target: "es2022",
  logLevel: "info",
});

await build({
  entryPoints: [resolve(packageRoot, "src/embed/app/auth.ts")],
  outfile: resolve(distRoot, "auth.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2020",
  legalComments: "none",
  logLevel: "info",
});

await build({
  entryPoints: [resolve(packageRoot, "src/features/p2p/worker.ts")],
  outfile: resolve(libRoot, "p2p-worker.cjs"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  legalComments: "none",
  logLevel: "info",
});

const clientBuild = await build({
  entryPoints: [resolve(packageRoot, "src/client/index.ts")],
  outfile: clientTemp,
  bundle: true,
  metafile: true,
  format: "cjs",
  platform: "browser",
  target: "es2020",
  external: ["react", "react/*", "@deepseek-ai/*"],
  legalComments: "none",
  logLevel: "info",
});
const clientInputs = Object.keys(clientBuild.metafile?.inputs ?? {});
const embedInputs = clientInputs.filter((input) => input.includes("src/embed/") || input.includes("src\\embed\\"));
if (embedInputs.length > 0) {
  throw new Error("mtmharness build: DSH client entry imports embed sources: " + embedInputs.join(", "));
}

const clientSource = readFileSync(clientTemp, "utf8");
const indented = clientSource.split("\n").map((line) => "    " + line).join("\n");
const artifact = [
  "window.__ModuleLoader__.load({",
  "  id: " + JSON.stringify(packageName) + ",",
  "  factory: (require) => {",
  "    var module = { exports: {} };",
  "    var exports = module.exports;",
  indented,
  "    return module.exports;",
  "  }",
  "});",
  "",
].join("\n");
if (!artifact.includes("window.__ModuleLoader__.load") || !artifact.includes("id: \"" + packageName + "\"")) {
  throw new Error("mtmharness build: generated client artifact does not have the DSH loader contract");
}
writeFileSync(resolve(libRoot, "client.js"), artifact);
writeFileSync(resolve(libRoot, "client.cjs"), artifact);
rmSync(clientTemp, { force: true });

execFileSync(vite, ["build", "--config", resolve(packageRoot, "vite.embed.config.ts")], { cwd: packageRoot, stdio: "inherit" });

const embedTypesRoot = resolve(distRoot, "types/embed");
mkdirSync(resolve(embedTypesRoot, "app"), { recursive: true });
writeFileSync(resolve(embedTypesRoot, "app/auth.d.ts"), [
  "export declare const OAUTH_CONTRACT_VERSION: 2;",
  "export interface OAuthClientConfig { issuer: string; clientId: string; redirectUri: string; resource: string; discoveryUrl?: string; scopes: readonly string[]; }",
  "export interface OAuthDiscovery { issuer: string; authorizationEndpoint: string; tokenEndpoint: string; userinfoEndpoint?: string; jwksUri: string; idTokenSigningAlgorithms: readonly string[]; revocationEndpoint?: string; endSessionEndpoint?: string; }",
  "export type MtmHarnessAuthStatus = \"signed-out\" | \"discovering\" | \"ready\" | \"authorizing\" | \"authenticated\" | \"error\";",
  "export interface MtmHarnessAuthSnapshot { status: MtmHarnessAuthStatus; accountPartition?: string; expiresAt?: number; error?: string; }",
  "export interface MtmHarnessTokenSource { getAccessToken(): Promise<string>; getAccountPartition(): string | undefined; subscribe(listener: (snapshot: MtmHarnessAuthSnapshot) => void): () => void; clear(): void; }",
  "export interface MtmHarnessAuthClient extends MtmHarnessTokenSource { getSnapshot(): MtmHarnessAuthSnapshot; discover(): Promise<OAuthDiscovery>; beginLogin(options?: { selectAccount?: boolean }): Promise<string>; consumeCallback(callbackUrl?: string): Promise<boolean>; logout(): Promise<void>; switchAccount(): Promise<string>; dispose(options?: { preserveAuthorization?: boolean }): void; }",
  "export declare class OAuthError extends Error { readonly code: string; readonly status?: number; }",
  "export declare class OAuthClient implements MtmHarnessAuthClient { constructor(config: OAuthClientConfig); getAccessToken(): Promise<string>; getAccountPartition(): string | undefined; subscribe(listener: (snapshot: MtmHarnessAuthSnapshot) => void): () => void; clear(): void; getSnapshot(): MtmHarnessAuthSnapshot; discover(): Promise<OAuthDiscovery>; beginLogin(options?: { selectAccount?: boolean }): Promise<string>; consumeCallback(callbackUrl?: string): Promise<boolean>; logout(): Promise<void>; switchAccount(): Promise<string>; dispose(options?: { preserveAuthorization?: boolean }): void; }",
  "export declare class MemoryTokenSource implements MtmHarnessTokenSource { constructor(accessToken: string, accountPartition?: string); getAccessToken(): Promise<string>; getAccountPartition(): string | undefined; subscribe(listener: (snapshot: MtmHarnessAuthSnapshot) => void): () => void; clear(): void; }",
  "export declare function createMemoryTokenSource(accessToken: string, accountPartition?: string): MemoryTokenSource;",
  "export declare function createPkceChallenge(verifier: string): Promise<string>;",
  "export declare function oauthTransactionStorageKey(config: OAuthClientConfig): string;",
  "",
].join("\n"));
writeFileSync(resolve(embedTypesRoot, "index.d.ts"), [
  'export * from "./app/auth.js";',
  "export type MtmHarnessClientMode = \"floating\" | \"dialog\" | \"fullscreen\";",
  "export type MtmHarnessWebSocketFactory = (url: URL, protocols: readonly string[]) => WebSocket | Promise<WebSocket>;",
  "export type MtmHarnessPresentationState = \"closed\" | \"panel\" | \"fullscreen\";",
  "export interface MtmHarnessPresentationController { snapshot(): MtmHarnessPresentationState; subscribe(listener: () => void): () => void; open(): void; close(): void; openFullShell(): void; }",
  "export interface MtmHarnessRuntimeBootstrap { apiOrigin?: string; oauth?: import(\"./app/auth.js\").OAuthClientConfig; accessToken?: string; tokenSource?: import(\"./app/auth.js\").MtmHarnessTokenSource; webSocketFactory?: MtmHarnessWebSocketFactory; }",
  "export interface MtmHarnessClientConfig extends MtmHarnessRuntimeBootstrap { target?: Element | string; apiOrigin: string; mode?: MtmHarnessClientMode; }",
  "export interface NormalizedClientConfig extends MtmHarnessRuntimeBootstrap { apiOrigin: string; mode: MtmHarnessClientMode; }",
  "export interface MtmHarnessClientHandle { unmount(): void; open(): void; close(): void; openFullShell(): void; }",
  "export declare function mount(config: MtmHarnessClientConfig): MtmHarnessClientHandle;",
  "export declare function autoMount(script: HTMLScriptElement): MtmHarnessClientHandle | null;",
  "export declare const MtmHarnessClient: { mount: typeof mount; autoMount: typeof autoMount };",
  "",
].join("\n"));

console.log("built mtmharness plugin and embed artifacts");
