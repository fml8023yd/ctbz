import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../skills/ctbz/', import.meta.url));
const scripts = path.join(root, 'scripts');

// dsh 版（T4）已退役 ZCode profile 注册链：initialize/doctor/render-agents/discover-config/validate-team
// 均保留 CLI 入口但内部输出退役文案并 exit 非 0。本文件不再"跑 prepare/activate/select"，
// 改为断言存根入口返回退役文案。
const RETIRED = ['initialize', 'doctor', 'render-agents', 'discover-config', 'validate-team'];

function run(script, args) {
  const result = spawnSync(process.execPath, [path.join(scripts, script), ...args], {encoding: 'utf8'});
  return {status: result.status, stdout: result.stdout, stderr: result.stderr};
}

test('ZCode 注册链 CLI 已退役：入口保留且返回退役文案、exit 非 0', () => {
  for (const script of RETIRED) {
    const r = run(script, []);
    assert.notEqual(r.status, 0, `${script} 必须非 0 退出`);
    assert.match(r.stderr, /已退役/, `${script} 必须报退役`);
    assert.match(r.stderr, /dsh 版不支持 ZCode profile 注册链/, `${script} 必须点名退役链`);
  }
});

test('initialize 旧子命令（prepare/activate/select/status）同样走退役文案而非执行', () => {
  for (const sub of ['prepare', 'activate', 'select', 'status']) {
    const r = run('initialize', [sub]);
    assert.notEqual(r.status, 0, `initialize ${sub} 必须非 0 退出`);
    assert.match(r.stderr, /已退役/, `initialize ${sub} 必须报退役`);
    assert.match(r.stderr, /dsh 版不支持 ZCode profile 注册链/);
  }
});

test('dashboard work.create 注册独立工作组且失败即关闭', () => {
  // 项目看板是 dsh 版仍保留的治理能力，不依赖 ZCode 注册链，故保留原断言。
  const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-gov-')));
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
});
