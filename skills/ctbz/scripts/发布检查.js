#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {packages, writeLock, verifyRepository, verifyPackage, repositoryRoot} from './lib/release.mjs';
try {
  const args = process.argv.slice(2), write = args.includes('--write-lock');
  const positional = args.filter(arg => arg !== '--write-lock');
  if (positional.length > 1 || positional.some(arg => arg.startsWith('--'))) throw Error('usage: 发布检查.js [repository-or-core-root] [--write-lock]');
  const root = positional.length ? path.resolve(positional[0]) : repositoryRoot;
  const coreOnly = path.basename(root) === 'ctbz' && path.basename(path.dirname(root)) === 'skills';
  if (write) {
    const repo = coreOnly ? path.resolve(root, '../..') : root;
    const actual = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    if (fs.realpathSync(repo) !== fs.realpathSync(actual) || !packages(repo).every(pkg => fs.existsSync(path.join(pkg.source, 'SKILL.md')))) throw Error('--write-lock requires the source repository; installed packages are read-only');
  }
  if (write) for (const pkg of coreOnly ? [{source: root}] : packages(root)) writeLock(pkg.source);
  const results = coreOnly ? [verifyPackage(root, 'core')] : verifyRepository(root);
  console.log(JSON.stringify({ok: true, wroteLock: write, packages: results}, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
