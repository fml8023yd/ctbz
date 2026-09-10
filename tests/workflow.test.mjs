import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync, spawnSync} from 'node:child_process';

const root = fileURLToPath(new URL('../skills/ctbz/', import.meta.url));
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('nine-stage preset is optional and preserves handoff and approval gates', () => {
  const text = read('references/recommended-workflow.md');
  for (const stage of ['①','②','③','④','⑤','⑥','⑦','⑧','⑨']) assert.ok(text.includes(`| ${stage}`));
  for (const required of ['逐项替换或不采用', '两层通过', '不自动进入⑧', '经济优先', './docs/design', '不随包分发', '不自动 commit']) assert.ok(text.includes(required), required);
  assert.ok(read('SKILL.md').includes('references/recommended-workflow.md'));
  assert.ok(read('methods/contract.md').includes('./docs/design/'));
});

test('design delegation preserves authority, permissions and quality', () => {
  const workflow = read('references/recommended-workflow.md');
  const contract = read('methods/contract.md');
  for (const required of ['①—⑦的 Agent 分工', '复杂设计和高风险复核使用能力匹配', '不重做全部工作', '不因此获得写权限', '未审定草稿与权威版本明确区分', '项目状态、manifest、调度和确认状态仍由主会话统一管理']) assert.ok(workflow.includes(required), required);
  assert.ok(contract.includes('文档内容生产可委派给已有写权限的执行角色'));
  assert.ok(contract.includes('只读角色仍只返回草稿'));
  for (const text of [workflow, contract]) {
    assert.ok(text.includes('不用通用 Agent 替代团队角色'));
    assert.ok(text.includes('未初始化、未激活或无合法候选'));
    assert.ok(text.includes('initialize select'));
  }
});

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
