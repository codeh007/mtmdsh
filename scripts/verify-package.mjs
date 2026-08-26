#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const packageDir = process.argv[2] ?? "packages/mtm-coding";
const tarball = process.argv[3];
execFileSync(process.execPath, [
  resolve(packageRoot, packageDir, "scripts/verify-package.mjs"),
  ...(tarball === undefined ? [] : [resolve(tarball)]),
], { cwd: packageRoot, stdio: "inherit" });
