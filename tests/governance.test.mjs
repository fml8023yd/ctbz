import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../skills/ctbz/', import.meta.url));
const scripts = path.join(root, 'scripts');

// 同 execution-chain.test.mjs 的隔离夹具：真实 CLI、虚构 provider（凭据声明齐备，
// base_url 指向不可达回环，不发起任何网络调用）。
function fixture() {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-gov-')));
  const config = path.join(temp, 'config.json');
  fs.writeFileSync(config, JSON.stringify({
    provider: {test: {name: 'Test Provider', kind: 'anthropic', enabled: true, source: 'custom',
      options: {baseURL: 'http://127.0.0.1:9', apiKey: 'fixture-key'},
      models: {
        design: {reasoning: {variants: ['high']}, contextLimit: 1000, outputLimit: 1000},
        economy: {reasoning: {variants: ['high']}, contextLimit: 1000, outputLimit: 1000},
      }}},
  }));
  const selection = path.join(temp, 'selection.json');
  fs.writeFileSync(selection, JSON.stringify(['custom:test:design', 'custom:test:economy']));
  return {temp, config, selection};
}

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...args], {encoding: 'utf8'});
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

function cli(args) { return run('initialize', args); }
function stateArgs(home, agents) { return ['--home', home, '--agents', agents]; }

test('prepare carries activated sessions across generations with unchanged profile names', () => {
  const {temp, config, selection} = fixture();
  const home = path.join(temp, 'state'), agents = path.join(temp, 'agents');
  const loaded = path.join(temp, 'loaded.json');
  const base = stateArgs(home, agents);
  assert.equal(cli(['prepare', ...base, '--config', config, '--selection', selection, '--session', 'gen1-session']).status, 0);
  fs.writeFileSync(loaded, JSON.stringify(fs.readdirSync(agents).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))));
  assert.equal(JSON.parse(cli(['activate', ...base, '--session', 'work-session', '--loaded', loaded, '--config', config]).stdout).status, 'OK');
  // 变更无关 provider 触发新 generation，profile 名称集合保持不变。
  const mutated = JSON.parse(fs.readFileSync(config, 'utf8'));
  mutated.provider.extra = {name: 'Extra', kind: 'anthropic', enabled: true, source: 'custom',
    options: {baseURL: 'http://127.0.0.1:9', apiKey: 'k2'}, models: {other: {reasoning: {variants: ['high']}}}};
  fs.writeFileSync(config, JSON.stringify(mutated));
  const prepared = cli(['prepare', ...base, '--config', config, '--selection', selection, '--session', 'gen2-session']);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).carriedSessions, 1);
  assert.equal(JSON.parse(prepared.stdout).phase, 'initialized');
  assert.ok(fs.existsSync(path.join(home, '已初始化.txt')), 'carry must rewrite the initialization marker');
  const statusAfterCarry = cli(['status', ...base]);
  assert.equal(JSON.parse(statusAfterCarry.stdout).initialized, true);
  const selected = cli(['select', ...base, '--session', 'work-session', '--loaded', loaded, '--role', 'tester', '--parent-model', 'custom:test:economy']);
  assert.equal(selected.status, 0, selected.stderr);
  assert.ok(JSON.parse(selected.stdout).profile.startsWith('team-ctbz-tester-'));
  console.log(`Carry evidence retained: ${temp}`);
});

test('adopt-run crosses generations, freezes the old manifest and records provenance', () => {
  const {temp, config, selection} = fixture();
  const home = path.join(temp, 'state'), agents = path.join(temp, 'agents');
  const loaded = path.join(temp, 'loaded.json');
  const workspace = path.join(temp, 'ws');
  fs.mkdirSync(workspace, {recursive: true});
  const base = stateArgs(home, agents);
  cli(['prepare', ...base, '--config', config, '--selection', selection, '--session', 'gen1-session']);
  fs.writeFileSync(loaded, JSON.stringify(fs.readdirSync(agents).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))));
  cli(['activate', ...base, '--session', 'work-session', '--loaded', loaded, '--config', config]);
  const state = () => JSON.parse(fs.readFileSync(path.join(home, '初始化状态.json'), 'utf8'));
  const gen1 = state().stateDir;
  const init = run('team-state', ['init-run', '--state-dir', gen1, '--team', 'ctbz', '--session', 'work-session', '--run-id', 'legacy-run', '--goal', 'legacy fixture run', '--workspace', workspace]);
  assert.equal(JSON.parse(init.stdout).initialized, true, init.stderr);
  const mutated = JSON.parse(fs.readFileSync(config, 'utf8'));
  mutated.provider.extra = {name: 'Extra', kind: 'anthropic', enabled: true, source: 'custom',
    options: {baseURL: 'http://127.0.0.1:9', apiKey: 'k2'}, models: {other: {reasoning: {variants: ['high']}}}};
  fs.writeFileSync(config, JSON.stringify(mutated));
  cli(['prepare', ...base, '--config', config, '--selection', selection, '--session', 'gen2-session']);
  const gen2 = state().stateDir;
  const adopt = run('team-state', ['adopt-run', '--state-dir', gen1, '--adopter-state-dir', gen2, '--team', 'ctbz', '--session', 'work-session', '--run-id', 'legacy-run', '--reason', 'cross-generation continuation fixture']);
  assert.equal(adopt.status, 0, adopt.stderr);
  const adopted = JSON.parse(adopt.stdout);
  assert.equal(adopted.adopted, true);
  assert.equal(adopted.crossGeneration, true);
  const oldManifest = JSON.parse(fs.readFileSync(path.join(gen1, 'ctbz', 'runs', 'legacy-run.json'), 'utf8'));
  const newManifest = JSON.parse(fs.readFileSync(path.join(gen2, 'ctbz', 'runs', 'legacy-run.json'), 'utf8'));
  assert.equal(oldManifest.status, 'cancelled');
  assert.match(oldManifest.summary, /superseded: adopted into/);
  assert.equal(newManifest.status, 'running');
  assert.equal(newManifest.sessionId, 'work-session');
  assert.equal(newManifest.teamConfigPath, JSON.parse(fs.readFileSync(path.join(gen2, 'ctbz', 'team-state.json'), 'utf8')).teamConfigPath);
  assert.ok(newManifest.adoptions.at(-1).fromStateDir === gen1 && newManifest.adoptions.at(-1).toStateDir === gen2);
  const reAdopt = run('team-state', ['adopt-run', '--state-dir', gen1, '--adopter-state-dir', gen2, '--team', 'ctbz', '--session', 'work-session', '--run-id', 'legacy-run', '--reason', 'again']);
  assert.notEqual(reAdopt.status, 0);
  assert.match(reAdopt.stderr, /terminal/);
  console.log(`Adoption evidence retained: ${temp}`);
});

test('dashboard work.create registers independent work groups and fails closed', () => {
  const {temp} = fixture();
  const workspace = path.join(temp, 'board');
  fs.mkdirSync(workspace, {recursive: true});
  assert.equal(run('dashboard', ['init', '--workspace', workspace, '--title', 'w', '--goal', 'w']).status, 0);
  const payload = path.join(temp, 'work.json');
  fs.writeFileSync(payload, JSON.stringify({node: {id: 'grp1', title: 'G1'}, work: {goal: 'g', mode: 'normal'}}));
  const created = run('dashboard', ['apply', '--workspace', workspace, '--action', 'work.create', '--file', payload, '--session', 'work-session']);
  assert.equal(created.status, 0, created.stderr);
  const duplicate = run('dashboard', ['apply', '--workspace', workspace, '--action', 'work.create', '--file', payload, '--session', 'work-session']);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stderr, /WORK_EXISTS/);
  const claim = path.join(temp, 'claim.json');
  fs.writeFileSync(claim, JSON.stringify({scopeId: 'grp1', sessionId: 'work-session'}));
  assert.equal(run('dashboard', ['apply', '--workspace', workspace, '--action', 'scope.claim', '--file', claim, '--session', 'work-session']).status, 0);
  const bad = path.join(temp, 'bad.json');
  fs.writeFileSync(bad, JSON.stringify({x: 1}));
  const unknown = run('dashboard', ['apply', '--workspace', workspace, '--action', 'work.create-typo', '--file', bad, '--session', 'work-session']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /valid actions/);
  console.log(`Dashboard evidence retained: ${temp}`);
});
