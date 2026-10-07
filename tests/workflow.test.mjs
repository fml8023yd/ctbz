import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../skills/ctbz/', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('both pinned archives include original license and expected source entry', () => {
  for (const [name, entry] of [['superpowers', 'skills/brainstorming/SKILL.md'], ['matt-pocock', 'skills/engineering/ask-matt/SKILL.md']]) {
    const info = JSON.parse(read(`vendor/${name}/source.json`));
    assert.match(info.commit, /^[a-f0-9]{40}$/);
    const archive = path.join(root, 'vendor', name, info.archive);
    const entries = execFileSync('tar', ['-tzf', archive], {encoding:'utf8'}).trim().split('\n');
    assert.ok(entries.some(file => file.endsWith('/' + entry)));
    const license = entries.find(file => /^[^/]+\/LICENSE$/.test(file));
    assert.ok(license);
    assert.equal(execFileSync('tar', ['-xOf', archive, license], {encoding:'utf8'}), read(`vendor/${name}/LICENSE`));
  }
});

test('upstream rejects unknown repositories and unsafe refs without network', () => {
  for (const args of [['check', 'unknown'], ['stage', 'superpowers', '--upload'], ['stage', 'matt-pocock', '../bad']]) {
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/upstream'), ...args], {encoding:'utf8'});
    assert.equal(result.status, 1);
  }
});

test('local pinned commit check is read-only and deterministic', () => {
  const info = JSON.parse(read('vendor/matt-pocock/source.json'));
  const before = read('dependencies.lock.json');
  const result = JSON.parse(execFileSync(process.execPath, [path.join(root, 'scripts/upstream'), 'check', 'matt-pocock', info.commit], {encoding:'utf8'}));
  assert.equal(result.changed, false);
  assert.equal(read('dependencies.lock.json'), before);
});
