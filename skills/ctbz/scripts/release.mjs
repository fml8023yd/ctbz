#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {VERSION, repositoryRoot, verifyRepository, packages} from './lib/release.mjs';

export function safeRemote(repo) {
  const remote = execFileSync('git', ['remote', 'get-url', 'origin'], {cwd: repo, encoding: 'utf8'}).trim();
  if (!['https://github.com/fml8023yd/ctbz.git', 'git@github.com:fml8023yd/ctbz.git'].includes(remote)) throw Error('origin must be the canonical credential-free CTBZ URL');
  return remote;
}

try {
  const args = process.argv.slice(2);
  let publish = false, output = path.join(repositoryRoot, `ctbz-pack-v${VERSION}-${new Date().toISOString().slice(0,10).replaceAll('-', '')}.tar.gz`);
  for (let i = 0; i < args.length; i++) {
    if (i === 0 && args[i] === VERSION) continue;
    if (args[i] === '--publish') publish = true;
    else if (args[i] === '--output' && args[i + 1]) output = path.resolve(args[++i]);
    else throw Error('usage: 发版.sh [0.0.1] [--output <archive>] [--publish]');
  }
  verifyRepository();
  if (fs.existsSync(output)) throw Error('archive already exists; choose another output');
  const temp = fs.mkdtempSync(path.join(tmpdir(), 'ctbz-release-'));
  try {
    for (const pkg of packages(repositoryRoot)) fs.cpSync(pkg.source, path.join(temp, pkg.id === 'core' ? 'skills/ctbz' : `adapters/${pkg.id}`), {recursive: true});
    for (const name of ['README.md', 'CHANGELOG.md']) if (fs.existsSync(path.join(repositoryRoot, name))) fs.copyFileSync(path.join(repositoryRoot, name), path.join(temp, name));
    verifyRepository(temp);
    fs.mkdirSync(path.dirname(output), {recursive: true});
    execFileSync('tar', ['-czf', output, '-C', temp, 'skills', 'adapters', ...['README.md', 'CHANGELOG.md'].filter(name => fs.existsSync(path.join(temp, name)))]);
    if (publish) {
      safeRemote(repositoryRoot);
      const git = args => execFileSync('git', args, {cwd: repositoryRoot, encoding: 'utf8'}).trim();
      if (git(['status', '--porcelain'])) throw Error('commit reviewed source before publishing');
      const tag = `v${VERSION}`;
      try { if (git(['rev-parse', tag + '^{commit}']) !== git(['rev-parse', 'HEAD'])) throw Error('existing tag points to another commit'); }
      catch (error) { if (error.status) git(['tag', tag]); else throw error; }
      git(['push', 'origin', 'HEAD:main', tag]);
      const notes = path.join(temp, 'notes.md');
      fs.writeFileSync(notes, `CTBZ ${VERSION}: one shared core, private Codex/ZCode native adapters, explicit parent fallback.\n`);
      execFileSync('gh', ['release', 'create', tag, output, '--repo', 'fml8023yd/ctbz', '--title', `CTBZ ${VERSION}`, '--notes-file', notes], {cwd: repositoryRoot, stdio: 'inherit'});
    }
    console.log(JSON.stringify({ok: true, version: VERSION, archive: output, published: publish}));
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
