import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {initialize, selectProfile} from '../skills/ctbz/scripts/lib/初始化.mjs';
import {route, defaultRules} from '../skills/ctbz/scripts/lib/本机配置.mjs';

const root = fileURLToPath(new URL('../skills/ctbz/', import.meta.url));
const registry = JSON.parse(fs.readFileSync(path.join(root, '角色清单.json')));
const models = ['custom:test:design', 'custom:test:economy'];
const catalog = {candidates: models.map(key => ({key, reasoningVariants: ['high']}))};
const bundle = initialize(registry, catalog, models);
const loaded = bundle.profiles.map(p => p.name);

test('offline generation preserves role tool boundaries and local references', () => {
  assert.equal(bundle.profiles.length, registry.roles.length * models.length);
  for (const p of bundle.profiles) {
    assert.ok(p.name.startsWith('team-ctbz-'));
    assert.ok(p.markdown.includes(root));
    assert.ok(!p.markdown.includes('父会话负责脚本、派发和落盘'));
    assert.ok(p.markdown.includes('项目状态与最终审定由父会话负责'));
    assert.ok(p.markdown.includes(p.tools.includes('Write') ? '可在授权写集合内运行任务脚本和生产文档' : '仅返回草稿或证据，不运行脚本、不写文件'));
    if (['planner','reviewer','explorer','researcher','reporter'].includes(p.role)) {
      assert.ok(!p.tools.includes('Write'));
      assert.ok(!p.tools.includes('Bash'));
    }
  }
});

test('routing obeys configured order, exclusions and loaded profiles', () => {
  const rules = defaultRules();
  rules.default.modelOrder = [models[1], models[0]];
  const order = route(rules, bundle.profiles, models[0], 'implementer');
  const chosen = selectProfile(bundle, registry, {defaultOrder: order}, 'implementer', loaded);
  assert.equal(chosen.modelRef, models[1]);
  assert.equal(selectProfile(bundle, registry, {defaultOrder: order}, 'implementer', loaded, [chosen.name]).modelRef, models[0]);
  assert.throws(() => selectProfile(bundle, registry, {defaultOrder: order}, 'implementer', []), /没有已加载/);
  assert.throws(() => selectProfile(bundle, registry, {defaultOrder: ['custom:test:unknown']}, 'implementer', loaded), /未初始化模型/);
  assert.deepEqual(route(defaultRules(), bundle.profiles, 'custom:other:model', 'implementer'), []);
});

test('registry and bundle drift fail closed', () => {
  assert.throws(() => selectProfile({...bundle, methodFingerprint:'stale'}, registry, {defaultOrder:models}, 'tester', loaded), /安装目录或方法版本/);
  assert.throws(() => selectProfile(bundle, {...registry, version:'changed'}, {defaultOrder:models}, 'tester', loaded), /角色版本漂移/);
});

test('isolated CLI prepare blocks unactivated dispatch and invalid activation config', () => {
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-chain-')));
  const home = path.join(temp, 'state'), agents = path.join(temp, 'agents');
  const cat = path.join(temp, 'catalog.json'), load = path.join(temp, 'loaded.json');
  fs.writeFileSync(cat, JSON.stringify(catalog));
  fs.writeFileSync(load, JSON.stringify(loaded));
  const cli = (cmd, args=[]) => spawnSync(process.execPath, [path.join(root,'scripts/initialize'), cmd, '--home', home, '--agents', agents, ...args], {encoding:'utf8'});
  const prepared = cli('prepare', ['--catalog',cat,'--session','fixture-session']);
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(JSON.parse(prepared.stdout).phase, 'awaiting-new-session');
  const selected = cli('select', ['--session','fixture-session','--loaded',load,'--role','implementer','--parent-model',models[0]]);
  assert.equal(selected.status, 1);
  assert.match(selected.stderr, /本会话尚未激活/);
  assert.match(selected.stderr, /无需重新 prepare/);
  const activated = cli('activate', ['--session','fixture-session','--loaded',load,'--config',cat]);
  assert.equal(activated.status, 1);
  assert.match(activated.stderr, /credentials-unverified/);
  assert.match(activated.stderr, /unknown-model-ref/);
  assert.ok(!fs.existsSync(path.join(home,'已初始化.txt')));
  const status = cli('status');
  assert.equal(JSON.parse(status.stdout).initialized, false);
  console.log(`Isolated evidence retained: ${temp}`);
});
