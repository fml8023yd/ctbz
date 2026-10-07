#!/usr/bin/env node
import {homedir} from 'node:os';
import {deploy, repositoryRoot} from './lib/release.mjs';
try {
  const args = process.argv.slice(2);
  let home = process.env.CTBZ_INSTALL_HOME || homedir(), checkOnly = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--home-dir' && args[i + 1]) home = args[++i];
    else if (args[i] === '--check-only') checkOnly = true;
    else throw Error('usage: 部署.js [--home-dir <absolute-home>] [--check-only]');
  }
  console.log(JSON.stringify(deploy(repositoryRoot, home, {checkOnly}), null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
