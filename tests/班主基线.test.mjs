import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// 班主基线 0.1.0 结构测试：解析核心 Markdown / JSON / 脚本，
// 断言规格（.ctbz-record/班主基线-实现规格.md）中的关键口径已落盘。
// 这些断言不放宽：文件缺失或关键词缺失即失败。

const repo = fileURLToPath(new URL('../', import.meta.url));
const core = path.join(repo, 'skills/ctbz');
const read = relative => fs.readFileSync(path.join(repo, relative), 'utf8');
const contains = (text, required, label) => {
  for (const keyword of required) {
    assert.ok(text.includes(keyword), `${label} 缺少关键词「${keyword}」`);
  }
};

// 负断言：子串出现即违规；否定句（如“不接管执行”）需用带否定前缀的完整子串排除。
const forbid = (text, banned, label) => {
  for (const phrase of banned) {
    assert.equal(text.includes(phrase), false, `${label} 出现禁用口径「${phrase}」`);
  }
};

test('班主基线.md 存在且写死零产出基线、拆分法与倒叙汇报', () => {
  const text = read('skills/ctbz/references/班主基线.md');
  contains(text, ['零产出', '拆、派、验、问', '三层验收', '30 分钟', '倒叙'], '班主基线.md');
  // 唯一例外与可写范围必须写明，防止“顺手”豁免。
  contains(text, ['亲力', '.ctbz-record'], '班主基线.md');
  // 倒叙结构原文 + 主进程亲力授权的判别字段，防旧口径换个说法回流。
  contains(text, ['细节在前，总结在后', 'parentExecutionAuthorized'], '班主基线.md');
});

test('自动模式.md 存在且覆盖计划流水线与执行流水线全链', () => {
  const text = read('skills/ctbz/references/自动模式.md');
  // 计划流水线：侦察 → 6 路计划 → 合并 → 6 路攻击 → 裁决。
  contains(text, ['P0.5', '6 路', '合并', '攻击', '裁决'], '自动模式.md 计划流水线');
  // 执行流水线：并行执行 → 集成 → 集成门 → 6 路全量验收 → 终检 → 交付/推送。
  contains(text, ['集成门', '全量验收'], '自动模式.md 执行流水线');
  // 宽度与版本绑定也在该文件。
  contains(text, ['宽度', 'planVersion'], '自动模式.md');
});

test('SKILL.md 引用两个新 reference 并声明自动默认与亲力例外', () => {
  const text = read('skills/ctbz/SKILL.md');
  contains(text, ['references/班主基线.md', 'references/自动模式.md'], 'SKILL.md 引用');
  contains(text, ['自动默认', '计划', '亲力'], 'SKILL.md 口径');
  forbid(text, ['主进程主动推进', '结论先行'], 'SKILL.md');
});

test('unified-workflow.md 模式简化为自动/计划', () => {
  const text = read('skills/ctbz/references/unified-workflow.md');
  contains(text, ['自动', '计划'], 'unified-workflow.md');
  // 决策升级必须发推送；推送失败不阻塞计时。
  forbid(text, ['推送不是计时生效前提', '不自动发送外部通知'], 'unified-workflow.md');
});

test('delivery-contract.md 含三层验收与倒叙汇报', () => {
  const text = read('skills/ctbz/references/delivery-contract.md');
  contains(text, ['三层验收', '倒叙'], 'delivery-contract.md');
  contains(text, ['决策账', '推送'], 'delivery-contract.md 交付配套');
});

test('派发.md 含侦察事实表、法定人数与跨 run 写集锁', () => {
  const text = read('skills/ctbz/references/派发.md');
  contains(text, ['planVersion', '法定人数', '跨 run'], '派发.md');
  contains(text, ['P0.5'], '派发.md 计划流水线');
});

test('failure-policy.md 不再把主进程执行当兜底', () => {
  const text = read('skills/ctbz/references/failure-policy.md');
  assert.equal(text.includes('主进程执行'), false, 'failure-policy.md 仍含“主进程执行”兜底');
  // 新口径：重派 / 报告 / 亲力须用户明确授权。
  contains(text, ['重派', '亲力'], 'failure-policy.md');
});

test('两个 adapter 具备后台派发、30 分钟唤醒与推送能力', () => {
  for (const adapter of ['adapters/zcode/SKILL.md', 'adapters/codex/SKILL.md']) {
    const text = read(adapter);
    contains(text, ['30 分钟', '推送'], adapter);
    // “主进程执行”只允许出现在否定句里（“不接管执行”“不执行”等）：
    // 剥掉所有带否定前缀的完整短语后再查禁用子串。
    const stripped = text.replace(/不(得|能|会|可|再|是|予|)?(接管|执行|亲力)[^。；\n]*/g, '');
    assert.equal(stripped.includes('主进程执行'), false, `${adapter} 以“主进程执行”作兜底`);
  }
  const zcode = read('adapters/zcode/SKILL.md');
  assert.ok(zcode.includes('run_in_background'), 'ZCode adapter 缺少 run_in_background 后台派发');
  const codex = read('adapters/codex/SKILL.md');
  assert.ok(codex.includes('spawn'), 'Codex adapter 缺少原生 spawn 语义');
});

test('版本 0.1.0 贯穿核心、适配器、发布脚本与注册表', () => {
  for (const file of [
    'skills/ctbz/SKILL.md',
    'adapters/zcode/SKILL.md',
    'adapters/codex/SKILL.md',
    'adapters/zcode/adapter.json',
    'adapters/codex/adapter.json',
    'skills/ctbz/scripts/lib/release.mjs',
    'skills/ctbz/角色清单.json',
    'skills/ctbz/methods/index.json',
  ]) {
    assert.ok(read(file).includes('0.1.0'), `${file} 未声明版本 0.1.0`);
  }
  assert.equal(JSON.parse(read('adapters/zcode/adapter.json')).version, '0.1.0', 'zcode adapter.json version 字段');
  assert.equal(JSON.parse(read('adapters/codex/adapter.json')).version, '0.1.0', 'codex adapter.json version 字段');
  assert.equal(JSON.parse(read('skills/ctbz/角色清单.json')).version, '0.1.0', '角色清单 version 字段');
  assert.equal(JSON.parse(read('skills/ctbz/methods/index.json')).version, '0.1.0', 'methods index version 字段');
  assert.match(read('skills/ctbz/scripts/lib/release.mjs'), /VERSION\s*=\s*['"]0\.1\.0['"]/, 'release.mjs VERSION 常量');
});

test('contract.md 删除主会话直接执行口径，保留任务身份声明', () => {
  const text = read('skills/ctbz/methods/contract.md');
  assert.equal(text.includes('主会话直接做小任务'), false, 'contract.md 仍含“主会话直接做小任务”');
  contains(text, ['任务身份'], 'contract.md');
});
