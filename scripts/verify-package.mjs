#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [packageDirArg = 'packages/mtm-codebase-memory', tarball] = process.argv.slice(2);
const packageDir = resolve(packageDirArg);
const packageJson = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8'));
const fail = (message) => { throw new Error(message); };

if (packageJson.private === true) fail('release package must not be private');
if (packageJson.name !== 'mtm-codebase-memory') fail(`unexpected package name: ${packageJson.name}`);
if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) fail(`package version must be stable SemVer: ${packageJson.version}`);
if (packageJson.dsh?.bundle?.patch !== './cordis.patch.yml') fail('package must declare dsh.bundle.patch as ./cordis.patch.yml');
if (!packageJson.files?.includes('README.md') || !packageJson.files?.includes('cordis.patch.yml')) fail('package files must include README.md and cordis.patch.yml');
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
    'package/package.json',
  ];
  if (files.join('\n') !== expected.join('\n')) {
    fail(`unexpected tarball files:\n${files.join('\n')}`);
  }
}

console.log(`verified ${packageJson.name}@${packageJson.version}${tarball ? ` (${tarball})` : ''}`);
