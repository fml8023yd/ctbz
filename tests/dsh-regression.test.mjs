import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

// 硬约束：node 用 /usr/local/bin/node。
const NODE = '/usr/local/bin/node';
const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const scripts = path.join(repoRoot, 'skills', 'ctbz', 'scripts');

function runNode(script, args, opts = {}) {
  const r = spawnSync(NODE, [script, ...args], {encoding: 'utf8', ...opts});
  return {status: r.status, stdout: r.stdout, stderr: r.stderr};
}

// ---------- T3 选型器 ----------

test('T3 选型器：讨论类覆盖 4 阵营，开发类不含 M5', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-pick-'));
  const ledger = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledger, '{}\n');

  const disc = runNode(path.join(scripts, 'pick-profile'),
    ['--kind', 'discussion', '--ledger', ledger, '--now', '2026-09-21T00:00:00Z']);
  assert.equal(disc.status, 0, disc.stderr);
  const d = JSON.parse(disc.stdout);
  const chosenVendors = new Set(d.decision_table.filter((t) => t.状态.includes('入选')).map((t) => t.阵营));
  assert.equal(chosenVendors.size, 4, `讨论类应覆盖 4 阵营，实际 ${[...chosenVendors].join(',')}`);
  for (const v of ['DeepSeek', '智谱', '腾讯', '月之暗面']) {
    assert.ok(chosenVendors.has(v), `讨论类缺阵营 ${v}`);
  }
  for (const s of d.slots) {
    assert.ok(s.provider, 'slot 缺 provider');
    assert.ok(s.model, 'slot 缺 model');
  }

  const dev = runNode(path.join(scripts, 'pick-profile'),
    ['--kind', 'dev', '--ledger', ledger, '--now', '2026-09-21T00:00:00Z']);
  assert.equal(dev.status, 0, dev.stderr);
  const v = JSON.parse(dev.stdout);
  assert.ok(v.decision_table.every((t) => t.代号 !== 'M5'), '开发类 decision_table 不得含 M5');
  assert.ok(v.slots.every((s) => s.code !== 'M5'), '开发类 slots 不得含 M5');
  assert.ok(!v.decision_table.some((t) => t.阵营 === '月之暗面'), '开发类排除 M5 后月之暗面阵营应缺席');
});

test('T3 选型器：反审席位 DeepSeek 换 deepseek-v4-pro', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-pick-'));
  const ledger = path.join(dir, 'ledger.json');
  fs.writeFileSync(ledger, '{}\n');
  const r = runNode(path.join(scripts, 'pick-profile'),
    ['--kind', 'discussion', '--role', 'reviewer', '--ledger', ledger, '--now', '2026-09-21T00:00:00Z']);
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  const m1 = j.slots.find((s) => s.code === 'M1');
  assert.equal(m1.model, 'deepseek-v4-pro');
  assert.match(m1.note, /deepseek-v4-pro/);
});

// ---------- T5 账本解析（不发网络请求） ----------

test('T5 账本解析：样例限额错误文本解析出冷却截止，账本 0600，check 冷却中 exit 1', () => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-ledger-')));
  const env = {...process.env, HOME: home};

  const report = runNode(path.join(scripts, '模型健康.js'),
    ['report', 'workbuddy/hy3', '[1310][您已达到每周/每月使用上限，您的限额将在 2026-09-25 18:00:00 重置。]'], {env});
  assert.equal(report.status, 0, report.stderr);
  assert.equal(JSON.parse(report.stdout).cooldown_until, '2026-09-25T10:00:00.000Z', '北京时间 18:00 应折为 UTC 10:00');

  const report2 = runNode(path.join(scripts, '模型健康.js'),
    ['report', 'workbuddy/glm-5.3-flash', '[429][rate limit exceeded, retry after 3600s]'], {env});
  assert.equal(report2.status, 0, report2.stderr);
  const until = JSON.parse(report2.stdout).cooldown_until;
  assert.ok(Number.isFinite(Date.parse(until)) && Date.parse(until) > Date.now(), 'retry-after 应解析为未来时刻');

  const ledgerFile = path.join(home, 'Documents', '.ctbz', '模型健康.json');
  assert.ok(fs.existsSync(ledgerFile), '账本文件应已落盘');
  assert.equal(fs.statSync(ledgerFile).mode & 0o777, 0o600, '账本文件须 0600');
  const data = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(data['workbuddy/hy3'].cooldown_until, '2026-09-25T10:00:00.000Z');
  assert.ok(data['workbuddy/hy3'].source.includes('限额'), 'source 应保留报错原文');

  const check = runNode(path.join(scripts, '模型健康.js'),
    ['check', 'workbuddy/hy3', 'workbuddy/glm-5.3-flash'], {env});
  assert.equal(check.status, 1, '存在冷却中模型时 check 应 exit 1');
  assert.match(check.stdout, /冷却中/);
});

// ---------- T7 骨架生成器 ----------

test('T7 骨架生成器：--dry-run 输出可被 JS 解析的 workflow 脚本体', () => {
  const plan = path.join(repoRoot, 'docs', 'ctbz-dsh-实施计划-20260921.md');
  assert.ok(fs.existsSync(plan), '计划文件应存在');
  const r = runNode(path.join(scripts, '反审.mjs'), ['--plan', plan, '--dry-run']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /语法校验通过/);
  assert.match(r.stdout, /四路反审骨架（start）/);
  assert.match(r.stdout, /return results;/);

  const start = '// ===== ctbz 四路反审骨架（start）=====';
  const end = '// ===== ctbz 四路反审骨架（end）=====';
  const body = r.stdout.split(start)[1].split(end)[0].trim();
  assert.ok(body.length > 0, '应提取到骨架体');
  // workflow 脚本体允许顶层 await/return；用 async IIFE 包裹后由 new Function 解析。
  assert.doesNotThrow(() => new Function('agent', `return (async () => {\n${body}\n})();`));
  assert.match(body, /provider: c\.provider, model: c\.model/);
  assert.ok(body.includes('deepseek-v4-pro'), '反审席位 DeepSeek 应 baked-in deepseek-v4-pro');
  assert.ok(body.includes('kimi-k2.8-preview'), '应含月之暗面阵营模型');
  assert.match(body, /RECORD_DIR/, '骨架应含每路裁决独立落盘的 RECORD_DIR');
});
