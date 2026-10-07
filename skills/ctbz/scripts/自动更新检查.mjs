#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {repositoryRoot, deploy, verifyRepository} from './lib/release.mjs';
const git = args => execFileSync('git', args, {cwd: repositoryRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
try {
  let apply = false, home = process.env.CTBZ_INSTALL_HOME || homedir();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--home-dir' && args[i + 1]) home = args[++i];
    else throw Error('usage: 自动更新检查.mjs [--apply] [--home-dir <absolute-home>]');
  }
  if (!fs.existsSync(path.join(repositoryRoot, '.git'))) throw Error('run updater from the source checkout');
  if (git(['status', '--porcelain'])) throw Error('source has local changes; update stopped');
  const remote = git(['remote', 'get-url', 'origin']);
  if (!['https://github.com/fml8023yd/ctbz.git', 'git@github.com:fml8023yd/ctbz.git'].includes(remote)) throw Error('origin must be canonical and credential-free');
  const local = git(['rev-parse', 'HEAD']), latest = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
  if (!/^[a-f0-9]{40}$/.test(latest)) throw Error('remote main not resolved');
  if (!apply || local === latest) { console.log(JSON.stringify({updated: false, available: local !== latest, local, latest})); }
  else {
    git(['fetch', 'origin', 'main']);
    git(['merge', '--ff-only', 'FETCH_HEAD']);
    try { verifyRepository(); const installed = deploy(repositoryRoot, home); console.log(JSON.stringify({updated: true, localBefore: local, current: git(['rev-parse', 'HEAD']), installed})); }
    catch (error) {
      // Restore only the clean fast-forward made above; installer has already rolled back its own transaction.
      if (!git(['status', '--porcelain'])) git(['reset', '--hard', local]);
      throw error;
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
