import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagesRoot = resolve(root, "packages");
const packageNames = new Set();

for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const packageJson = resolve(packagesRoot, entry.name, "package.json");
  if (!existsSync(packageJson)) continue;
  const { name } = JSON.parse(readFileSync(packageJson, "utf8"));
  if (typeof name === "string") packageNames.add(name);
}

const errors = new Set();
const filterPattern = /\bpnpm\s+--filter\s+(?:"([^"]+)"|'([^']+)'|([^\s"'\x60|&;]+))/g;
const packagePathPattern = /\bpackages\/([A-Za-z0-9._-]+)(?=\/|["'\x60\s]|$)/g;
const sourcePathPattern = /\b(packages\/[A-Za-z0-9._-]+\/(?:src|tests)\/[A-Za-z0-9._\/-]+\.[A-Za-z0-9]+)\b/g;
const trackedFiles = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
  .split("\0")
  .filter(Boolean);

for (const file of trackedFiles) {
  if (file === "scripts/check-workspace-references.mjs") continue;
  const data = readFileSync(resolve(root, file));
  if (data.includes(0)) continue;
  const source = data.toString("utf8");

  for (const match of source.matchAll(filterPattern)) {
    const selector = match[1] ?? match[2] ?? match[3];
    if (!packageNames.has(selector)) {
      errors.add(file + ": unknown pnpm workspace filter \"" + selector + "\"");
    }
  }

  for (const match of source.matchAll(packagePathPattern)) {
    const packageName = match[1];
    if (!packageNames.has(packageName)) {
      errors.add(file + ": unknown workspace package path \"packages/" + packageName + "\"");
    }
  }

  if (file.startsWith(".github/workflows/")) {
    for (const match of source.matchAll(sourcePathPattern)) {
      const referencedPath = match[1];
      if (!existsSync(resolve(root, referencedPath))) {
        errors.add(file + ": missing source reference \"" + referencedPath + "\"");
      }
    }
  }
}

if (errors.size > 0) {
  console.error([...errors].join("\n"));
  process.exitCode = 1;
} else {
  console.log("workspace references valid (" + packageNames.size + " packages)");
}
