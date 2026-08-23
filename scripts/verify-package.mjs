#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [packageDirArg = 'packages/mtm-codebase-memory', tarball] = process.argv.slice(2);
const packageDir = resolve(packageDirArg);
const packageJson = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };

if (packageJson.private === true) fail('release package must not be private');
if (packageJson.name !== 'mtm-codebase-memory') fail('unexpected package name: ' + packageJson.name);
if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) fail('package version must be stable SemVer: ' + packageJson.version);
if (packageJson.main !== './dist/index.js' || packageJson.types !== './dist/index.d.ts') {
  fail('package must expose dist/index.js and dist/index.d.ts');
}
if (packageJson.dsh?.bundle?.patch !== './cordis.patch.yml') {
  fail('package must declare dsh.bundle.patch as ./cordis.patch.yml');
}
if (!packageJson.files?.includes('dist')
  || !packageJson.files.includes('README.md')
  || !packageJson.files.includes('cordis.patch.yml')) {
  fail('package files must include dist, README.md, and cordis.patch.yml');
}
if (packageJson.peerDependencies?.['@deepseek-ai/dsh-mcp-client'] !== '^0.1.1-rc.2'
  || packageJson.devDependencies?.['@deepseek-ai/dsh-mcp-client'] !== '0.1.1-rc.2') {
  fail('package must peer against and develop on the DSH MCP client release line');
}
if (packageJson.dependencies?.npm !== '11.7.0') {
  fail('package must pin the package-owned npm CLI used for PATH-independent provisioning');
}
const runtimeFiles = ['dist/index.js', 'dist/index.d.ts', 'dist/runtime.js', 'dist/runtime.d.ts'];
for (const file of runtimeFiles) {
  if (!existsSync(resolve(packageDir, file))) fail('missing built runtime file: ' + file);
}
const runtimeSource = readFileSync(resolve(packageDir, 'dist/runtime.js'), 'utf8');
if (!runtimeSource.includes('CBM_PACKAGE_VERSION = "0.10.8"')
  || !runtimeSource.includes('codebase-memory-mcp@')) {
  fail('runtime must pin lazy provisioning to codebase-memory-mcp@0.10.8');
}
readFileSync(resolve(packageDir, packageJson.dsh.bundle.patch), 'utf8');

if (tarball) {
  const files = execFileSync('tar', ['-tzf', resolve(tarball)], { encoding: 'utf8' })
    .split('\n')
    .filter((entry) => entry.startsWith('package/') && !entry.endsWith('/'))
    .sort();
  const expected = [
    'package/LICENSE',
    'package/README.md',
    'package/cordis.patch.yml',
    'package/dist/index.d.ts',
    'package/dist/index.js',
    'package/dist/runtime.d.ts',
    'package/dist/runtime.js',
    'package/package.json',
  ];
  if (files.join('\n') !== expected.join('\n')) {
    fail('unexpected tarball files:\n' + files.join('\n'));
  }
}

console.log('verified ' + packageJson.name + '@' + packageJson.version + (tarball ? ' (' + tarball + ')' : ''));
