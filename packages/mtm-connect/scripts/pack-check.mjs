#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const destination = mkdtempSync(join(tmpdir(), "mtm-connect-pack-"));
try {
  execFileSync("pnpm", ["pack", "--pack-destination", destination], { cwd: packageRoot, stdio: "inherit" });
  const tarball = readdirSync(destination).find((name) => name.endsWith(".tgz"));
  if (tarball === undefined) throw new Error("mtm-connect pack: pnpm did not create a tarball");
  const entries = execFileSync("tar", ["-tzf", join(destination, tarball)], { encoding: "utf8" }).split("\n");
  for (const entry of ["package/LICENSE", "package/README.md", "package/package.json", "package/lib/client.js", "package/lib/types/index.d.ts", "package/lib/types/client/index.d.ts"]) {
    if (!entries.includes(entry)) throw new Error("mtm-connect pack: missing " + entry);
  }
  if (entries.some((entry) => entry.includes(".test."))) throw new Error("mtm-connect pack: test files must not ship");
  const source = readFileSync(join(packageRoot, "lib/client.js"), "utf8");
  for (const forbidden of [/^\s*import\s/m, /require\(["']node:/, /require\(["'](?:fs|child_process)/, "@deepseek-ai/", "__ModuleLoader__"]) {
    if (forbidden instanceof RegExp ? forbidden.test(source) : source.includes(forbidden)) throw new Error("mtm-connect pack: client artifact is not self-contained: " + forbidden);
  }
  if (!source.includes("export {")) throw new Error("mtm-connect pack: client artifact does not export mount");
} finally {
  rmSync(destination, { recursive: true, force: true });
}
