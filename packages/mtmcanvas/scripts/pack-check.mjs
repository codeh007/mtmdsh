#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const destination = mkdtempSync(join(tmpdir(), "mtmcanvas-pack-"));
try {
  execFileSync("pnpm", ["pack", "--pack-destination", destination], { cwd: packageRoot, stdio: "inherit" });
  const tarball = readdirSync(destination).find((name) => name.endsWith(".tgz"));
  if (tarball === undefined) throw new Error("mtmcanvas pack: pnpm did not create a tarball");
  execFileSync(process.execPath, [join(packageRoot, "scripts/verify-package.mjs"), join(destination, tarball)], { cwd: packageRoot, stdio: "inherit" });
} finally {
  rmSync(destination, { recursive: true, force: true });
}
