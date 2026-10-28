import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

// 班主基线 0.2.0 结构测试：解析核心 Markdown / JSON / 脚本，
// 断言规格（.ctbz-record/班主基线-实现规格.md）与
// （.ctbz-record/0.2.0-留痕与质疑预演.md）中的关键口径已落盘。
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
  // 0.2.0：留痕与方法沉淀 + 质疑预演两节必须落盘。
  contains(text, ['留痕', '可复用方法', '探索记录', '质疑预演', '用户视角'], '班主基线.md 0.2.0');
});

test('自动模式.md 存在且覆盖计划流水线与执行流水线全链', () => {
  const text = read('skills/ctbz/references/自动模式.md');
  // 计划流水线：侦察 → 6 路计划 → 合并 → 6 路攻击 → 裁决。
  contains(text, ['P0.5', '6 路', '合并', '攻击', '裁决'], '自动模式.md 计划流水线');
  // 执行流水线：并行执行 → 集成 → 集成门 → 6 路全量验收 → 终检 → 交付/推送。
  contains(text, ['集成门', '全量验收'], '自动模式.md 执行流水线');
  // 宽度与版本绑定也在该文件。
  contains(text, ['宽度', 'planVersion'], '自动模式.md');
  // 0.2.0：E4 质疑预演、E5 方法留痕与质疑预演记录。
  contains(text, ['留痕', '质疑预演'], '自动模式.md 0.2.0');
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
  // 0.2.0：交付门槛含方法留痕与质疑预演。
  contains(text, ['方法留痕', '质疑预演'], 'delivery-contract.md 0.2.0');
});

test('派发.md 含侦察事实表、法定人数与跨 run 写集锁', () => {
  const text = read('skills/ctbz/references/派发.md');
  contains(text, ['planVersion', '法定人数', '跨 run'], '派发.md');
  contains(text, ['P0.5'], '派发.md 计划流水线');
  // 0.2.0：回执带 method、任务身份含 challenger、E3 镜头含用户质疑。
  contains(text, ['method', 'challenger', '用户质疑'], '派发.md 0.2.0');
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

test('版本 0.2.1 贯穿核心、适配器、发布脚本与注册表', () => {
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
    assert.ok(read(file).includes('0.2.1'), `${file} 未声明版本 0.2.1`);
  }
  assert.equal(JSON.parse(read('adapters/zcode/adapter.json')).version, '0.2.1', 'zcode adapter.json version 字段');
  assert.equal(JSON.parse(read('adapters/codex/adapter.json')).version, '0.2.1', 'codex adapter.json version 字段');
  assert.equal(JSON.parse(read('skills/ctbz/角色清单.json')).version, '0.2.1', '角色清单 version 字段');
  assert.equal(JSON.parse(read('skills/ctbz/methods/index.json')).version, '0.2.1', 'methods index version 字段');
  assert.match(read('skills/ctbz/scripts/lib/release.mjs'), /VERSION\s*=\s*['"]0\.2\.1['"]/, 'release.mjs VERSION 常量');
});

test('contract.md 删除主会话直接执行口径，保留任务身份声明', () => {
  const text = read('skills/ctbz/methods/contract.md');
  assert.equal(text.includes('主会话直接做小任务'), false, 'contract.md 仍含“主会话直接做小任务”');
  contains(text, ['任务身份'], 'contract.md');
});

// ── 0.2.0 并行线修复：leader 派生授权 / 复命硬闸 / 流程资产降级 ──

test('班主基线.md 落盘 leader 派生授权与复命闸口径', () => {
  const text = read('skills/ctbz/references/班主基线.md');
  // B-13：leader 派生授权（唯一例外 + 最多 2 级 + 工人拒绝派生）。
  contains(text, ['leader', '派生'], '班主基线.md leader 派生授权');
  // A-1：复命闸与失败策略联动。
  contains(text, ['复命'], '班主基线.md 复命闸');
});

test('delivery-contract.md 含复命硬闸：exit≠0 不得标交付完成', () => {
  const text = read('skills/ctbz/references/delivery-contract.md');
  // A-1：交付前硬闸 + 六段复命清单。
  contains(text, ['内审.mjs 复命', '复命清单'], 'delivery-contract.md 复命硬闸');
});

test('failure-policy.md 含 depth-exceeded 等失败码', () => {
  const text = read('skills/ctbz/references/failure-policy.md');
  // B-7：派生深度超限的失败码。
  contains(text, ['depth-exceeded'], 'failure-policy.md 失败码');
});

test('内审协议.md 含复命命令契约', () => {
  const text = read('skills/ctbz/references/内审协议.md');
  // A-1 配套：复命命令契约（六段格式、A/B/C 含义）。
  contains(text, ['复命'], '内审协议.md 复命契约');
});

test('cost-rules.json 的 role_tier.light 含 reporter', () => {
  const rules = JSON.parse(read('skills/ctbz/cost-rules.json'));
  assert.ok(rules.role_tier && typeof rules.role_tier === 'object', 'role_tier 必须存在');
  assert.ok(Array.isArray(rules.role_tier.light), 'role_tier.light 必须是数组');
  assert.ok(
    rules.role_tier.light.includes('reporter'),
    `role_tier.light 缺 reporter（当前：${JSON.stringify(rules.role_tier.light)}）`
  );
  // 角色不得同时出现在两个档位。
  const heavy = new Set(rules.role_tier.heavy || []);
  const overlap = rules.role_tier.light.filter(role => heavy.has(role));
  assert.equal(overlap.length, 0, `角色不得同时在 heavy 与 light：${overlap.join(', ')}`);
});

test('unified-workflow.md 统一【假设与边界】假设条目前缀口径', () => {
  const text = read('skills/ctbz/references/unified-workflow.md');
  // B-1：假设条目以「假设：」或「假设N：」开头，避免 A 闸把边界/舞台行误当假设条目。
  assert.ok(
    /假设\s*[N\d０-９]?\s*[:：]/.test(text),
    'unified-workflow.md 未写死「假设：」/「假设N：」前缀口径'
  );
});

test('SKILL.md 流程资产段写死 index.json 缺失时的降级口径', () => {
  const text = read('skills/ctbz/SKILL.md');
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(l => /^##\s/.test(l) && l.includes('流程资产'));
  assert.ok(start >= 0, 'SKILL.md 缺「流程资产」段');
  let end = start + 1;
  while (end < lines.length && !/^##\s/.test(lines[end])) end++;
  const section = lines.slice(start, end).join('\n');
  // A-2：索引缺失时的降级口径（只提示不拦截 / 显式标未校验）。
  assert.ok(section.includes('index.json'), 'SKILL.md 流程资产段未提 index.json');
  assert.ok(
    /缺失|不存在|降级|未校验|跳过/.test(section),
    'SKILL.md 流程资产段未写死 index.json 缺失/损坏时的降级口径'
  );
});

test('内审.mjs 复命闸：exit≠0 时不得静默通过', () => {
  const script = path.join(core, 'scripts/内审.mjs');
  assert.ok(fs.existsSync(script), '缺 skills/ctbz/scripts/内审.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-fuming-'));
  const bad = path.join(dir, 'bad.md');
  // 缺「自主修复:」「自疑:」「行动账增量:」三段 → 复命闸必须判红并 exit≠0。
  fs.writeFileSync(
    bad,
    ['自主延伸:', '- 试图扩大范围 → /tmp/x.md', '', '交付前三问:', '- 做了什么：改了两个文件', '- 为什么：需求如此', '- 下一步：继续', '', '待裁决:', ''].join('\n'),
    'utf8'
  );
  const r = spawnSync(process.execPath, [script, '复命', '--file', bad], {encoding: 'utf8'});
  assert.notEqual(r.status, 0, `复命闸对不合格清单应 exit≠0，实际 exit=${r.status}，输出：${r.stdout}${r.stderr}`);
  assert.ok(/✗/.test(r.stdout + r.stderr), '复命闸不合格时应输出违规明细（✗）');
  fs.rmSync(dir, {recursive: true, force: true});
});

// T20：嵌套 leader 拒绝（leader 派生 leader）。
test('看板拒绝嵌套 leader：leader 的祖先链不得再出现 leader', async () => {
  const storeUrl = pathToFileURL(path.join(core, 'scripts/lib/dashboard-store.mjs')).href;
  const store = await import(storeUrl);
  const ws = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-nested-leader-')));
  await store.initBoard(ws, {title: '嵌套 leader 负例', goal: 'leader 不得派生 leader'});
  await store.mutateBoard(ws, 'node.upsert', {
    node: {id: 'lead-outer', kind: 'group', role: 'leader', title: '外层组长'},
  });
  await assert.rejects(
    store.mutateBoard(ws, 'node.upsert', {
      node: {id: 'lead-inner', kind: 'group', role: 'leader', title: '内层组长', parentId: 'lead-outer'},
    }),
    error => {
      assert.ok(error instanceof store.DashboardError, `嵌套 leader 应以 DashboardError 拒绝，实际：${error?.message}`);
      assert.match(error.message, /leader|嵌套|depth|派生/i, `嵌套 leader 拒绝原因未说明：${error.message}`);
      return true;
    },
    'leader 派生 leader 必须被拒绝（最多 2 级：主→组长→工人）'
  );
});

// T21：流程资产降级——index.json 缺失时 C 闸显式标「未校验」，不静默通过。
test('内审 C 闸：index.json 缺失时显式标「未校验」', () => {
  const script = path.join(core, 'scripts/内审.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ctbz-cgate-'));
  const home = path.join(dir, 'home');
  fs.mkdirSync(home, {recursive: true});
  // 刻意不创建 ~/.ctbz/流程/index.json → 触发降级路径。
  const file = path.join(dir, '复命.md');
  fs.writeFileSync(file, VALID_FUMING.join('\n'), 'utf8');
  const r = spawnSync(process.execPath, [script, '复命', '--file', file], {
    encoding: 'utf8',
    env: {...process.env, HOME: home},
  });
  const out = (r.stdout || '') + (r.stderr || '');
  assert.ok(
    /未校验/.test(out),
    `index.json 缺失时 C 闸须显式标「未校验」，不得静默跳过。实际输出：${out}`
  );
  // 降级为「只提示不拦截」：不因缺索引而阻断复命闸（见 SKILL.md 流程资产段）。
  assert.equal(r.status, 0, `流程资产降级不应阻断复命闸，实际 exit=${r.status}，输出：${out}`);
  fs.rmSync(dir, {recursive: true, force: true});
});

// ── 0.2.1 失败内审即时化 ──

test('班主基线.md 写死失败即时内审：即时记录 + 禁用 + 重派', () => {
  const text = read('skills/ctbz/references/班主基线.md');
  // 即时性：不等整批结束。
  contains(text, ['即时'], '班主基线.md 0.2.1 即时');
  // 失败 Agent 在任务级禁用，同一 run 内不再派发同一身份。
  contains(text, ['禁用'], '班主基线.md 0.2.1 禁用');
  // 默认处置是重派新 Agent，不是静默亲力。
  contains(text, ['重派'], '班主基线.md 0.2.1 重派');
});

test('failure-policy.md 含 immediate-audit / agent-disabled 失败码', () => {
  const text = read('skills/ctbz/references/failure-policy.md');
  const ok = text.includes('immediate-audit') || text.includes('agent-disabled');
  assert.ok(
    ok,
    'failure-policy.md 缺少 0.2.1 失败码「immediate-audit」或「agent-disabled」'
  );
});

test('自动模式.md 写死失败不等整批、立即重派', () => {
  const text = read('skills/ctbz/references/自动模式.md');
  const ok = text.includes('不等整批') || text.includes('立即重派');
  assert.ok(
    ok,
    '自动模式.md 缺少 0.2.1 执行流水线失败即时处理口径「不等整批」或「立即重派」'
  );
});

test('delivery-contract.md 含失败内审交付门槛', () => {
  const text = read('skills/ctbz/references/delivery-contract.md');
  const ok = text.includes('失败内审') || text.includes('audit-');
  assert.ok(
    ok,
    'delivery-contract.md 缺少 0.2.1 失败内审交付门槛「失败内审」或「audit-」'
  );
});

test('native-runtime.test.mjs 覆盖 onTaskFailure 失败即时回调', () => {
  const text = read('tests/native-runtime.test.mjs');
  const ok =
    text.includes('onTaskFailure') ||
    /失败[^\n]{0,20}重派|即时重派/.test(text);
  assert.ok(
    ok,
    'tests/native-runtime.test.mjs 缺少 0.2.1 失败即时重派 / onTaskFailure 回调测试'
  );
});

// 复命清单合法夹具（六段齐全 + 假设与边界），供 C 闸降级用例复用。
const VALID_FUMING = [
  '# 复命 ctbz-0.2.0',
  '',
  '自主延伸:',
  '- 补跑了探活 → docs/探活.md',
  '',
  '自主修复:',
  '- 修了缺陷 → skills/ctbz/scripts/部署.js',
  '',
  '交付前三问:',
  '- 答案对齐: 复命闸六段齐全 → tests/班主基线.test.mjs:198',
  '- 半途扫描: 全部动作有终态，无悬空项',
  '- 跑偏检查: 交付内容条条回指复命段',
  '',
  '待裁决:',
  '无',
  '',
  '自疑:',
  '- 断言可能被插入位移击穿 → 证伪实验: node --test tests/内审.test.mjs → 结果: 10 pass / 0 fail',
  "- 夹具段数可能漏改 → 证伪实验: grep -c '自疑:' tests/内审.test.mjs → 结果: exit 0",
  '- 闸门口径可能与计划不符 → 证伪实验: node scripts/内审.mjs 复命 --file /tmp/f.md → 结果: exit 0',
  '',
  '行动账增量:',
  '无',
  '',
  '【假设与边界】:',
  '- 假设1：用户授权已就位：推翻条件＝收到明确撤销指令',
  '- 假设2：写入落点在本仓库内：推翻条件＝路径越过 write-set 边界',
  '',
];
