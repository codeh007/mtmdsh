import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import * as ts from "typescript";
import {
  defineConfig,
  type Plugin,
  type UserConfig,
  build as viteBuild,
} from "vite";
import packageManifest from "./package.json" with { type: "json" };

const packageRoot = fileURLToPath(new URL(".", import.meta.url));
const packageName = packageManifest.name;
const source = (file: string) => resolve(packageRoot, "src", file);
const isBareImport = (id: string): boolean =>
  !id.startsWith(".") && !id.startsWith("/") && !id.startsWith("\0");
const isReactImport = (id: string): boolean =>
  /^(?:react|react-dom)(?:\/|$)/u.test(id);
const hostExternal = (id: string): boolean => isBareImport(id);
const clientExternal = (id: string): boolean =>
  isReactImport(id) || id.startsWith("@deepseek-ai/");

type ProfileName = "host" | "client" | "worker" | "embed" | "auth";
type Format = "es" | "cjs" | "iife";

type Profile = {
  readonly entry: string;
  readonly outDir: string;
  readonly formats: readonly Format[];
  readonly fileName: string | ((format: string) => string);
  readonly external?: (id: string) => boolean;
  readonly target: string;
  readonly emptyOutDir: boolean;
};

const profiles: Record<ProfileName, Profile> = {
  host: {
    entry: source("index.ts"),
    outDir: "lib",
    formats: ["es"],
    fileName: "index",
    external: hostExternal,
    target: "node22",
    emptyOutDir: true,
  },
  client: {
    entry: source("client/index.ts"),
    outDir: "lib",
    formats: ["cjs"],
    fileName: "client",
    external: clientExternal,
    target: "es2020",
    emptyOutDir: false,
  },
  worker: {
    entry: source("features/p2p/worker.ts"),
    outDir: "lib",
    formats: ["es"],
    fileName: () => "p2p-worker.cjs",
    target: "es2022",
    external: () => false,
    emptyOutDir: false,
  },
  embed: {
    entry: source("embed/index.tsx"),
    outDir: "dist",
    formats: ["es", "iife"],
    fileName: (format) =>
      format === "iife" ? "mtmharness.iife.js" : "mtmharness.js",
    target: "es2020",
    emptyOutDir: true,
  },
  auth: {
    entry: source("embed/app/auth.ts"),
    outDir: "dist",
    formats: ["es"],
    fileName: "auth",
    target: "es2020",
    emptyOutDir: false,
  },
};

const profileOrder: readonly ProfileName[] = [
  "host",
  "client",
  "worker",
  "embed",
  "auth",
];

function profileConfig(name: ProfileName, orchestrate: boolean): UserConfig {
  const profile = profiles[name];
  return {
    root: packageRoot,
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    plugins: [
      ...(name === "client" || name === "embed" ? [react()] : []),
      ...(name === "embed" ? [tailwindcss()] : []),
      ...(name === "client" ? [dshClientLoaderPlugin()] : []),
      ...(name === "host" ? [declarationPlugin()] : []),
      ...(orchestrate ? [buildProfilesPlugin()] : []),
    ],
    build: {
      target: profile.target,
      outDir: resolve(packageRoot, profile.outDir),
      emptyOutDir: profile.emptyOutDir,
      sourcemap: false,
      cssCodeSplit: false,
      rollupOptions: {
        external: profile.external,
        output: { codeSplitting: false },
      },
      lib: {
        entry: profile.entry,
        name: "MtmHarnessClient",
        formats: [...profile.formats],
        fileName: profile.fileName,
      },
    },
  };
}

function buildProfilesPlugin(): Plugin {
  return {
    name: "mtmharness-build-profiles",
    async closeBundle() {
      for (const name of profileOrder.slice(1))
        await viteBuild({ ...profileConfig(name, false), configFile: false });
    },
  };
}

function dshClientLoaderPlugin(): Plugin {
  return {
    name: "mtmharness-dsh-client-loader",
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (item) => item.type === "chunk" && item.isEntry,
      );
      if (entry?.type !== "chunk")
        throw new Error("mtmharness build: DSH client entry chunk is missing");
      const indented = entry.code
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n");
      entry.code = [
        "window.__ModuleLoader__.load({",
        `  id: ${JSON.stringify(packageName)},`,
        "  factory: (require) => {",
        "    var module = { exports: {} };",
        "    var exports = module.exports;",
        indented,
        "    return module.exports;",
        "  }",
        "});",
        "",
      ].join("\n");
    },
  };
}

function declarationPlugin(): Plugin {
  return {
    name: "mtmharness-declarations",
    writeBundle() {
      const configPath = resolve(packageRoot, "tsconfig.json");
      const result = ts.readConfigFile(configPath, ts.sys.readFile);
      if (result.error !== undefined)
        throw new Error(diagnosticText(result.error));
      const parsed = ts.parseJsonConfigFileContent(
        result.config,
        ts.sys,
        packageRoot,
      );
      if (parsed.errors.length > 0)
        throw new Error(parsed.errors.map(diagnosticText).join("\n"));
      const program = ts.createProgram({
        rootNames: parsed.fileNames,
        options: parsed.options,
      });
      const diagnostics = ts.getPreEmitDiagnostics(program);
      if (diagnostics.length > 0)
        throw new Error(diagnostics.map(diagnosticText).join("\n"));
      const emitted = program.emit();
      if (emitted.diagnostics.length > 0)
        throw new Error(emitted.diagnostics.map(diagnosticText).join("\n"));
    },
  };
}

function diagnosticText(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
}

export default defineConfig(() => profileConfig("host", true));
